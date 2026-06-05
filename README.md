# Society Events — Local Development Stack

One `make up` + `make setup-otp` gets you a fully seeded database, OAuth 2.0,
mobile OTP login, an SMS gateway, a DB GUI, Redis — everything you need on
any machine, from first clone to working login in under five minutes.

---

## Prerequisites

| Tool | Min version | Install |
|------|-------------|---------|
| Docker Desktop | 24+ | https://docs.docker.com/get-docker/ |
| Docker Compose | v2 (bundled) | included with Docker Desktop |
| GNU Make | any | `sudo apt install make` / Homebrew `make` |
| Python 3 | 3.10+ | https://python.org (only for `otp-secret` generation) |

> **WSL2 users (Windows):** Docker Desktop with WSL2 backend works. Open the
> project in Windows Terminal from inside the WSL2 distro, not from
> PowerShell/CMD.

---

## Quick start (any machine — owner or junior)

```bash
# 1. Clone / copy the project
git clone <repo-url> society-events
cd society-events

# 2. Create env file from the example
cp .env.example .env
#    Review .env and adjust passwords if running on a shared machine.
#    (The defaults work fine for local dev.)

# 3. Start the core stack
make up
#    First boot pulls images and builds containers — allow ~3 min.
#    Keycloak alone takes ~60 s to initialise its database.
make ps   # watch until all services show "healthy"

# 4. Set up mobile OTP login (one command — fully idempotent)
make setup-otp
#    This does four things automatically:
#      [1] Generates OTP_BRIDGE_CLIENT_SECRET in .env
#      [2] Runs DB migration 002_mobile_otp.sql
#      [3] Registers otp-bridge client in the running Keycloak
#      [4] Builds + starts the OTP Bridge service
```

After `make setup-otp` you will see:

```
  OTP setup complete! [prod]
  Health : http://localhost:8080/api/otp/health
  Docs   : http://localhost:8080/api/otp/docs
  SMS gateway is currently set to: log
```

That's it — everything is live.

---

## Service URLs (default ENV=prod)

> All services are served through nginx on `NGINX_PORT` (default **8080**).
> Keycloak admin is accessible directly on `KEYCLOAK_PORT` (**8081**).

| Service | URL | Credentials |
|---------|-----|-------------|
| **App** | http://localhost:8080/ | —  |
| **Mobile OTP login** | http://localhost:8080/mobile-login | your registered phone |
| **Phone registration** | http://localhost:8080/phone-register | — |
| **Keycloak admin** | http://localhost:8081/admin/ | `KEYCLOAK_ADMIN_USER/PASSWORD` in `.env` |
| **pgAdmin** | http://localhost:8080/pgadmin/ | `PGADMIN_EMAIL/PASSWORD` in `.env` |
| **Splunk** | http://localhost:8080/splunk/ | `SPLUNK_PASSWORD` in `.env` |
| **User API docs** | http://localhost:8080/api/users/docs | — |
| **Event API docs** | http://localhost:8080/api/events/docs | — |
| **OTP Bridge docs** | http://localhost:8080/api/otp/docs | — |

---

## Test accounts (Keycloak realm: `society-events`)

All passwords: **Test@1234**

| Name | Email | Role |
|------|-------|------|
| Rajesh Iyer | rajesh.iyer@pvh-blr.in | admin |
| Meera Krishnan | meera.krishnan@gmail.com | committee_member |
| Arjun Sharma | arjun.sharma@gmail.com | resident |
| Priya Nair | priya.nair@gmail.com | resident |
| Sanjay Mehta | sanjay.mehta@outlook.com | resident |
| Vikram Patel | vikram.patel@gmail.com | resident (NRI — USD payments) |

To add a phone number to an existing test user for OTP login:

```bash
make shell-db
UPDATE users SET phone = '+919876543210' WHERE email = 'arjun.sharma@gmail.com';
\q
```

Then log in at `/mobile-login` with `+919876543210`.
In dev, OTPs are printed in `make logs-otp` — no physical phone needed.

---

## Mobile OTP — step-by-step for a junior setting up on a new machine

This section explains **every step** so someone who has never seen the project
can get the mobile OTP feature working from scratch.

### Step 1 — Start the core stack

```bash
cp .env.example .env     # once per machine; keep defaults for local dev
make up                  # starts postgres, redis, keycloak, user/event services, frontend
make ps                  # wait until ALL services say "healthy"
```

### Step 2 — Run OTP setup (one command)

```bash
make setup-otp
```

This is fully **idempotent** — safe to run again if anything went wrong.
Internally it does:

| Sub-step | What happens |
|----------|-------------|
| `otp-secret` | Generates a 64-char random `OTP_BRIDGE_CLIENT_SECRET` and appends it to `.env` |
| DB migration | Runs `db/migrations/002_mobile_otp.sql` — adds `username` column, makes `email` nullable, adds `UNIQUE` on `phone` |
| Keycloak config | Creates `otp-bridge` confidential client with service account; grants `impersonation` role from `realm-management` |
| Build + start | Builds `services/otp/` image; starts `otp-service` container; rebuilds nginx to activate the `/api/otp/` routes |

### Step 3 — Verify everything is working

```bash
# OTP service health (should return {"status":"ok"})
curl http://localhost:8080/api/otp/health

# Try requesting an OTP (using a phone already in the users table)
curl -X POST http://localhost:8080/api/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210"}'

# Watch the OTP appear in logs (SMS_GATEWAY=log mode)
make logs-otp
# Look for: [SMS-LOG] >>> To +919876543210: Your Society Events OTP is 382915
```

### Step 4 — Test the full browser flow

1. Open http://localhost:8080
2. Click **Sign in with Mobile OTP**
3. Enter the phone number you updated in the DB (`+919876543210`)
4. Copy the OTP from `make logs-otp`
5. Enter it in the browser — you should land on the dashboard

### Step 5 — Enable real SMS (optional, when using a physical phone)

```bash
# Connect your Android phone via USB and enable USB Tethering
# Check the device shows up:
ls /dev/ttyUSB* 2>/dev/null || ls /dev/ttyACM* 2>/dev/null

# Update .env:
SMS_GATEWAY=gammu
USB_MODEM_DEVICE=/dev/ttyUSB0   # match the device above

# Uncomment the devices: block in docker-compose.yml otp-service section, then:
make restart-otp-service

# Test a real SMS send:
curl -X POST http://localhost:8080/api/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "+91XXXXXXXXXX"}'
```

See [docs/mobile-otp-setup.md](docs/mobile-otp-setup.md) for full Gammu
configuration, USB stability tips, and the Kannel/PlaySMS alternative.

---

## All Make targets

```bash
# ── Core lifecycle ─────────────────────────────────────────
make up                  # start all services (builds if needed)
make down                # stop containers (data preserved in volumes)
make restart             # rebuild and restart all
make reset               # ⚠ wipe volumes + restart fresh
make ps                  # health status of all containers
make logs                # follow all logs
make validate-ports      # check for port conflicts in .env

# ── OTP / Mobile login ─────────────────────────────────────
make setup-otp           # full OTP setup: secret → DB → Keycloak → service (idempotent)
make otp-secret          # generate OTP_BRIDGE_CLIENT_SECRET only
make setup-otp-keycloak  # Keycloak otp-bridge client only (re-runnable)
make restart-otp-service # rebuild + restart otp-service after code/env changes
make logs-otp            # follow otp-service logs (OTPs printed here in log mode)

# ── Individual service restarts ────────────────────────────
make restart-nginx           # rebuild nginx (picks up nginx.conf changes)
make restart-keycloak        # restart Keycloak (picks up theme/realm changes)
make restart-user-service    # rebuild user service
make restart-event-service   # rebuild event service
make restart-otp-service     # rebuild OTP bridge service

# ── Database ───────────────────────────────────────────────
make shell-db            # open psql in society_events
make shell-redis         # open redis-cli
make seed                # re-run seed SQL (idempotent)
make migrate             # run all db/migrations/*.sql (idempotent)

# ── Logs ───────────────────────────────────────────────────
make logs-nginx    make logs-kc    make logs-db
make logs-user     make logs-events   make logs-otp

# ── Frontend dev (without Docker) ─────────────────────────
make frontend            # hot-reload shell app on http://localhost:3000
make frontend-install    # npm install only

# ── Monitoring (stage/prod) ────────────────────────────────
make monitoring-up ENV=stage
make monitoring-down ENV=stage
```

---

## Architecture overview

```
Browser
  └─► Nginx (port 8080)
        ├─► /                → frontend shell (React + MFEs)
        ├─► /realms/         → Keycloak (OIDC/OAuth2)
        ├─► /api/users/      → User Service (FastAPI, port 3001)
        ├─► /api/events/     → Event Service (FastAPI, port 3002)
        └─► /api/otp/        → OTP Bridge Service (FastAPI, port 3003)
                                    │
                                    ├─► Redis       (OTP storage, sessions)
                                    ├─► User Service (phone → user lookup)
                                    └─► Keycloak    (token exchange / impersonation)

Keycloak (port 8081, direct) ──► PostgreSQL (port 5432)
```

**Mobile OTP token flow:**

```
User enters phone
  → OTP Bridge sends OTP via SMS (or logs it in dev mode)
  → User enters OTP
  → Bridge validates against Redis (HMAC-SHA256 hash, 5 min TTL, max 3 attempts)
  → Bridge calls Keycloak Token Exchange (RFC 8693, server-side only)
  → Returns Keycloak access_token + bridge session_token (8 h)
  → Frontend stores tokens; refreshes via /api/otp/refresh every ~5 min
  → All existing API calls work unchanged (same JWT format as Google login)
```

---

## Directory layout

```
society-events/
├── Makefile                        ← all dev commands
├── docker-compose.yml              ← all services
├── .env.example                    ← template for .env
├── db/
│   ├── init/
│   │   ├── 00_create_keycloak_db.sh   ← creates keycloak DB on first boot
│   │   ├── 01_schema.sql              ← all DDL + indexes
│   │   └── 02_seed.sql                ← dummy users + society data
│   └── migrations/
│       └── 002_mobile_otp.sql         ← username col, nullable email, unique phone
├── services/
│   ├── user/                       ← User Service (FastAPI)
│   ├── event/                      ← Event Service (FastAPI)
│   └── otp/                        ← OTP Bridge Service (FastAPI, new)
│       ├── app/
│       │   ├── config.py           ← settings from env vars
│       │   ├── otp_store.py        ← Redis OTP + session storage
│       │   ├── sms.py              ← Gammu / log / disabled SMS gateway
│       │   ├── keycloak_admin.py   ← token exchange via Keycloak Admin API
│       │   └── routes/
│       │       ├── otp.py          ← /send  /verify  /refresh  /logout
│       │       └── register.py     ← /register/send-otp  /register/confirm
│       ├── requirements.txt
│       └── Dockerfile
├── frontend/
│   └── shell/
│       └── src/
│           ├── contexts/
│           │   └── AuthContext.tsx  ← dual-mode auth (Keycloak SSO + OTP)
│           └── pages/
│               ├── Landing.tsx     ← sign-in buttons incl. mobile OTP
│               ├── MobileLogin.tsx ← phone + OTP login page
│               └── PhoneRegister.tsx ← phone registration (username mandatory)
├── keycloak/
│   └── realm.json                  ← otp-bridge client + service account
├── nginx/
│   └── nginx.conf                  ← /api/otp/ routes + otp rate-limit zone
└── docs/
    └── mobile-otp-setup.md         ← Gammu, SMS gateway, kcadm steps
```

---

## Keycloak OAuth 2.0 integration notes

The realm has three clients:

**`society-frontend`** (public, PKCE) — React shell and MFEs.

```js
const keycloak = new Keycloak({
  url: 'http://localhost:8080',   // nginx proxies /realms/ to Keycloak
  realm: 'society-events',
  clientId: 'society-frontend',
});
await keycloak.init({ onLoad: 'check-sso', pkceMethod: 'S256' });
```

**`society-api`** (confidential, service account) — backend inter-service calls. Validates tokens via:

```
http://keycloak:8081/realms/society-events/protocol/openid-connect/certs
```

**`otp-bridge`** (confidential, service account) — used **only** by the OTP
Bridge service. The service account has the `impersonation` role from
`realm-management`, enabling RFC 8693 token exchange. The client secret
never reaches the browser.

---

## Environment variables reference

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NGINX_PORT` | yes | `8080` | Host port for nginx (all browser traffic) |
| `KEYCLOAK_PORT` | yes | `8081` | Keycloak HTTP port (direct access only) |
| `POSTGRES_USER/PASSWORD` | yes | — | PostgreSQL credentials |
| `REDIS_PASSWORD` | yes | — | Redis auth password |
| `KEYCLOAK_ADMIN_USER/PASSWORD` | yes | — | Keycloak master realm admin |
| `KEYCLOAK_API_CLIENT_SECRET` | yes | — | `society-api` client secret |
| `OTP_BRIDGE_CLIENT_SECRET` | yes | auto-generated by `make setup-otp` | `otp-bridge` client secret |
| `SMS_GATEWAY` | no | `log` | `log` \| `gammu` \| `disabled` |
| `USB_MODEM_DEVICE` | no | `/dev/ttyUSB0` | Modem device (SMS_GATEWAY=gammu only) |
| `GOOGLE_CLIENT_ID/SECRET` | no | — | Enables Google social login |
| `GMAIL_SMTP_USER/APP_PASSWORD` | no | — | Keycloak outbound email |

---

## Payment gateway — Razorpay test mode

1. Sign up free at https://dashboard.razorpay.com → Test mode
2. Copy your test `key_id` and `key_secret`
3. Add to `.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. Test card: `4111 1111 1111 1111`, any future date, CVV `123`
5. UPI test: `success@razorpay`

---

## Resetting the database

```bash
make reset    # ⚠ destroys all volumes, reinitialises schema + seed
#             # After reset you must run: make setup-otp (re-runs migration + builds service)
```

To only re-seed without wiping volumes:

```bash
make seed     # idempotent — safe to run many times
```

To re-run schema migrations only:

```bash
make migrate  # runs all db/migrations/*.sql in order (each is idempotent)
```
