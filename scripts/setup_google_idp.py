#!/usr/bin/env python3
"""
Applies Google Social Login to the *running* Keycloak instance via Admin REST API.

Safe to run multiple times — every step is idempotent.

Steps:
  1. Obtain a short-lived admin token from the master realm.
  2. Create (or update) the Google Identity Provider in the society-events realm.
  3. Copy the built-in "first broker login" flow to "first broker login - google"
     (skipped if the copy already exists).
  4. Set "Review Profile" to DISABLED in the copied flow.
  5. Add "Automatically Link Existing" (idp-auto-link) as ALTERNATIVE in the
     copied flow, positioned *before* the "User creation or linking" sub-flow,
     so users with a matching email are linked silently without a confirmation page.

Run via:
    make setup-google-idp
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def _load_dotenv(path: str = ".env") -> None:
    """Parse .env and populate os.environ. Handles Windows CRLF line endings."""
    try:
        with open(path, encoding="utf-8") as fh:
            for raw in fh:
                line = raw.strip().rstrip("\r\n").strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and key not in os.environ:   # env vars already set take precedence
                    os.environ[key] = val
    except FileNotFoundError:
        pass   # running with env vars already exported — fine


_load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
KEYCLOAK_URL     = os.getenv("KEYCLOAK_URL", "https://auth.gm-global-techies-town.club")
ADMIN_USER       = os.getenv("KEYCLOAK_ADMIN_USER",     "admin")
ADMIN_PASSWORD   = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "")
REALM            = os.getenv("KEYCLOAK_REALM",           "society-events")
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID",     "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

FLOW_NAME = "first broker login - google"


# ── HTTP helpers ─────────────────────────────────────────────────────────────

def _http(method: str, path: str, body=None, token: str | None = None,
          form: dict | None = None) -> tuple[int, dict | list | None]:
    url = f"{KEYCLOAK_URL}{path}"

    if form is not None:
        data    = urllib.parse.urlencode(form).encode()
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
    elif body is not None:
        data    = json.dumps(body).encode()
        headers = {"Content-Type": "application/json"}
    else:
        data    = None
        headers = {}

    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw else None)


def _assert(status: int, expected: tuple, label: str, body=None) -> None:
    if status not in expected:
        print(f"  ✗  {label} — HTTP {status}: {body}")
        sys.exit(1)


# ── Step 1: Admin token ───────────────────────────────────────────────────────

def get_admin_token() -> str:
    status, body = _http(
        "POST",
        "/realms/master/protocol/openid-connect/token",
        form={
            "client_id":  "admin-cli",
            "grant_type": "password",
            "username":   ADMIN_USER,
            "password":   ADMIN_PASSWORD,
        },
    )
    _assert(status, (200,), "Obtain admin token", body)
    print("  ✓  Admin token obtained")
    return body["access_token"]


# ── Step 2: Google Identity Provider ─────────────────────────────────────────

def setup_idp(token: str) -> None:
    idp_rep = {
        "alias":                      "google",
        "displayName":                "Google",
        "providerId":                 "google",
        "enabled":                    True,
        "updateProfileFirstLoginMode": "off",   # skip "re-enter your name" screen
        "trustEmail":                 True,     # trust Google's verified email
        "storeToken":                 False,
        "addReadTokenRoleOnCreate":   False,
        "authenticateByDefault":      False,
        "linkOnly":                   False,
        "firstBrokerLoginFlowAlias":  FLOW_NAME,
        "config": {
            "clientId":         GOOGLE_CLIENT_ID,
            "clientSecret":     GOOGLE_CLIENT_SECRET,
            "defaultScope":     "openid profile email",
            "disableUserInfo":  "false",
            "useJwksUrl":       "true",
            "syncMode":         "IMPORT",
        },
    }

    status, _ = _http("GET", f"/admin/realms/{REALM}/identity-provider/instances/google", token=token)
    if status == 200:
        status, body = _http("PUT", f"/admin/realms/{REALM}/identity-provider/instances/google",
                             body=idp_rep, token=token)
        _assert(status, (200, 204), "Update Google IDP", body)
        print("  ✓  Google IDP updated (client ID + secret refreshed)")
    else:
        status, body = _http("POST", f"/admin/realms/{REALM}/identity-provider/instances",
                             body=idp_rep, token=token)
        _assert(status, (200, 201), "Create Google IDP", body)
        print("  ✓  Google IDP created")


# ── Step 3: Copy the built-in first-broker-login flow ────────────────────────

def ensure_flow_copy(token: str) -> None:
    status, flows = _http("GET", f"/admin/realms/{REALM}/authentication/flows", token=token)
    _assert(status, (200,), "List authentication flows")

    if any(f["alias"] == FLOW_NAME for f in (flows or [])):
        print(f"  ✓  Flow '{FLOW_NAME}' already exists — skipping copy")
        return

    src_alias_enc = urllib.parse.quote("first broker login", safe="")
    status, body = _http(
        "POST",
        f"/admin/realms/{REALM}/authentication/flows/{src_alias_enc}/copy",
        body={"newName": FLOW_NAME},
        token=token,
    )
    _assert(status, (200, 201), f"Copy flow to '{FLOW_NAME}'", body)
    print(f"  ✓  Flow '{FLOW_NAME}' created (copied from 'first broker login')")


# ── Steps 4 & 5: Modify the copied flow ──────────────────────────────────────

def _get_executions(token: str, flow_alias: str) -> list:
    alias_enc = urllib.parse.quote(flow_alias, safe="")
    status, execs = _http(
        "GET",
        f"/admin/realms/{REALM}/authentication/flows/{alias_enc}/executions",
        token=token,
    )
    _assert(status, (200,), f"List executions of '{flow_alias}'")
    return execs or []


def _put_execution(token: str, flow_alias: str, exe: dict) -> None:
    alias_enc = urllib.parse.quote(flow_alias, safe="")
    status, body = _http(
        "PUT",
        f"/admin/realms/{REALM}/authentication/flows/{alias_enc}/executions",
        body=exe,
        token=token,
    )
    _assert(status, (200, 204), f"Update execution '{exe.get('displayName', exe.get('providerId'))}'", body)


def disable_review_profile(token: str) -> None:
    execs = _get_executions(token, FLOW_NAME)
    for exe in execs:
        if exe.get("providerId") == "idp-review-profile":
            if exe.get("requirement") == "DISABLED":
                print("  ✓  Review Profile already DISABLED")
                return
            exe["requirement"] = "DISABLED"
            _put_execution(token, FLOW_NAME, exe)
            print("  ✓  Review Profile set to DISABLED")
            return
    print("  !  Review Profile execution not found — skipping")


def add_auto_link(token: str) -> None:
    """
    Add idp-auto-link as ALTERNATIVE at the top-level of the copied flow,
    positioned *before* the 'User creation or linking' sub-flow so that
    users with a matching email are linked silently.
    """
    execs = _get_executions(token, FLOW_NAME)

    # Check if it already exists
    for exe in execs:
        if exe.get("providerId") == "idp-auto-link":
            if exe.get("requirement") != "ALTERNATIVE":
                exe["requirement"] = "ALTERNATIVE"
                _put_execution(token, FLOW_NAME, exe)
                print("  ✓  'Automatically Link' requirement set to ALTERNATIVE")
            else:
                print("  ✓  'Automatically Link' already ALTERNATIVE — skipping")
            return

    # Add the execution
    alias_enc = urllib.parse.quote(FLOW_NAME, safe="")
    status, body = _http(
        "POST",
        f"/admin/realms/{REALM}/authentication/flows/{alias_enc}/executions/execution",
        body={"provider": "idp-auto-link"},
        token=token,
    )
    _assert(status, (200, 201), "Add 'Automatically Link' execution", body)
    print("  ✓  'Automatically Link' execution added")

    # Fetch updated list so we have the new execution's ID
    execs = _get_executions(token, FLOW_NAME)

    # Set its requirement to ALTERNATIVE
    for exe in execs:
        if exe.get("providerId") == "idp-auto-link":
            exe["requirement"] = "ALTERNATIVE"
            _put_execution(token, FLOW_NAME, exe)
            print("  ✓  'Automatically Link' set to ALTERNATIVE")
            break

    # Raise its priority until it sits *before* the 'User creation or linking' sub-flow.
    # We do this by repeatedly calling raisePriority until the level-0 ordering is correct.
    _raise_auto_link_priority(token)


def _raise_auto_link_priority(token: str) -> None:
    """
    Move idp-auto-link above the 'User creation or linking' sub-flow
    by calling raisePriority in a loop.
    """
    for _ in range(20):   # safety ceiling
        execs = _get_executions(token, FLOW_NAME)

        # Collect top-level executions in display order
        top = [e for e in execs if e.get("level", 0) == 0]

        auto_link_idx    = next((i for i, e in enumerate(top) if e.get("providerId") == "idp-auto-link"), None)
        user_creation_idx = next(
            (i for i, e in enumerate(top)
             if e.get("authenticationFlow") and "user creation" in e.get("displayName", "").lower()),
            None,
        )

        if auto_link_idx is None:
            print("  !  Could not find 'Automatically Link' in top-level — skipping priority adjustment")
            return

        if user_creation_idx is None or auto_link_idx <= user_creation_idx:
            print("  ✓  'Automatically Link' is positioned before 'User creation or linking'")
            return

        # Still too low — raise by one step
        exe_id = top[auto_link_idx]["id"]
        status, body = _http(
            "POST",
            f"/admin/realms/{REALM}/authentication/executions/{exe_id}/raise-priority",
            token=token,
        )
        _assert(status, (200, 204), "Raise priority of 'Automatically Link'", body)

    print("  !  Could not reposition 'Automatically Link' after 20 attempts — check Admin Console")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        print("⚠  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — skipping Google IDP setup.")
        print("   The 'Continue with Google' button will not appear on the login page.")
        print("   Set both variables in .env and re-run: make setup-google-idp")
        return

    print()
    print("  Configuring Google Social Login in Keycloak…")
    print(f"  Keycloak : {KEYCLOAK_URL}")
    print(f"  Realm    : {REALM}")
    print()

    token = get_admin_token()
    ensure_flow_copy(token)       # flow must exist before IDP references it
    disable_review_profile(token)
    add_auto_link(token)
    setup_idp(token)              # create/update IDP last, now that flow is ready

    print()
    print("  Done. Restart Keycloak to clear any theme/config caches:")
    print("  make restart-keycloak")
    print()


if __name__ == "__main__":
    main()
