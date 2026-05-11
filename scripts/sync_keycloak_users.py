#!/usr/bin/env python3
"""
Sync users from keycloak/realm.json → society_events.users (PostgreSQL).

Behaviour:
  - If the users table is EMPTY  → insert ALL users from realm.json.
  - If the users table has rows  → insert only NEW users (keycloak_sub not yet present).
  - Existing rows are never overwritten (safe to re-run at any time).

Run via:   make sync-users
"""
import json
import os
import sys

# ---------------------------------------------------------------------------
# Bootstrap psycopg2 (the Docker image may not have it pre-installed)
# ---------------------------------------------------------------------------
try:
    import psycopg2
except ModuleNotFoundError:
    import subprocess
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"],
        stdout=subprocess.DEVNULL,
    )
    import psycopg2

# ---------------------------------------------------------------------------
# Config from environment (injected by `docker run -e` or Makefile)
# ---------------------------------------------------------------------------
PG_HOST     = os.getenv("POSTGRES_HOST",     "society_postgres")
PG_PORT     = int(os.getenv("POSTGRES_PORT", "5432"))
PG_DB       = os.getenv("POSTGRES_DB",       "society_events")
PG_USER     = os.getenv("POSTGRES_USER",     "society_user")
PG_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")
REALM_PATH  = os.getenv("REALM_JSON_PATH",   "/realm.json")

# Role priority: pick the highest-privilege role for the postgres column
ROLE_RANK = {"admin": 1, "committee_member": 2, "resident": 3, "security_guard": 4}


def best_role(realm_roles: list[str]) -> str:
    return min(realm_roles, key=lambda r: ROLE_RANK.get(r, 99), default="resident")


def main() -> None:
    # ------------------------------------------------------------------
    # Load realm.json
    # ------------------------------------------------------------------
    try:
        with open(REALM_PATH) as f:
            realm = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: realm.json not found at {REALM_PATH}")
        sys.exit(1)

    realm_users: list[dict] = realm.get("users", [])
    if not realm_users:
        print("No users found in realm.json — nothing to do.")
        return

    # ------------------------------------------------------------------
    # Connect
    # ------------------------------------------------------------------
    try:
        conn = psycopg2.connect(
            host=PG_HOST, port=PG_PORT, dbname=PG_DB,
            user=PG_USER, password=PG_PASSWORD,
            connect_timeout=10,
        )
    except psycopg2.OperationalError as exc:
        print(f"ERROR: cannot connect to postgres ({PG_HOST}:{PG_PORT}): {exc}")
        sys.exit(1)

    conn.autocommit = True
    cur = conn.cursor()

    # ------------------------------------------------------------------
    # Decide mode: full seed vs. incremental
    # ------------------------------------------------------------------
    cur.execute("SELECT COUNT(*) FROM users")
    existing_count: int = cur.fetchone()[0]

    if existing_count == 0:
        print(f"Users table is empty → inserting all {len(realm_users)} users from realm.json")
        mode = "full"
    else:
        print(f"Users table has {existing_count} rows → inserting only new users from realm.json")
        mode = "incremental"

    # ------------------------------------------------------------------
    # Fetch already-present keycloak_sub values (for incremental mode)
    # ------------------------------------------------------------------
    cur.execute("SELECT keycloak_sub FROM users WHERE keycloak_sub IS NOT NULL")
    existing_subs: set[str] = {row[0] for row in cur.fetchall()}

    # ------------------------------------------------------------------
    # Insert
    # ------------------------------------------------------------------
    inserted = 0
    skipped  = 0

    for u in realm_users:
        keycloak_sub = u["id"]
        email        = u["email"]
        name         = f"{u.get('firstName', '')} {u.get('lastName', '')}".strip()
        role         = best_role(u.get("realmRoles", ["resident"]))
        is_active    = u.get("enabled", True)

        if mode == "incremental" and keycloak_sub in existing_subs:
            print(f"  skip  {name} ({email}) — already in DB")
            skipped += 1
            continue

        cur.execute(
            """
            INSERT INTO users (name, email, role, keycloak_sub, identity_provider, is_active)
            VALUES (%s, %s, %s, %s, 'keycloak', %s)
            ON CONFLICT (email) DO NOTHING
            """,
            (name, email, role, keycloak_sub, is_active),
        )
        print(f"  added {name} ({email}) [{role}]")
        inserted += 1

    cur.close()
    conn.close()

    print()
    print(f"Done — {inserted} inserted, {skipped} skipped.")
    print("Open pgAdmin at http://localhost:5050 to verify.")


if __name__ == "__main__":
    main()
