# Society Events — Local Development Stack

One `make up` gets you a fully seeded database, OAuth 2.0, a DB GUI,
Redis, and a local mail inbox — everything you need before writing a
single line of microservice code.

---

## Prerequisites

| Tool | Min version |
|------|-------------|
| Docker Desktop | 24+ |
| Docker Compose | v2 (bundled with Desktop) |
| GNU Make | any |

---

## Quick start

```bash
# 1. Clone / unzip the project
cd society-events

# 2. Create your env file (Makefile auto-does this too)
cp .env.example .env          # review and adjust passwords if needed

# 3. Start everything
make up

# 4. Watch services come healthy (Keycloak takes ~60s on first boot)
make ps
```

---

## Service URLs

| Service | URL | Default login |
|---------|-----|---------------|
| **pgAdmin** | http://localhost:5050 | See `.env` → `PGADMIN_EMAIL/PASSWORD` |
| **Keycloak admin** | http://localhost:8080 | See `.env` → `KEYCLOAK_ADMIN_*` |
| **Mailpit inbox** | http://localhost:8025 | No auth in dev |
| **PostgreSQL** | `localhost:5432` | See `.env` → `POSTGRES_USER/PASSWORD` |
| **Redis** | `localhost:6379` | See `.env` → `REDIS_PASSWORD` |

---

## Test user accounts (Keycloak realm: `society-events`)

All passwords: **Test@1234**

| Name | Email | Role |
|------|-------|------|
| Rajesh Iyer | rajesh.iyer@pvh-blr.in | admin |
| Meera Krishnan | meera.krishnan@gmail.com | committee_member |
| Arjun Sharma | arjun.sharma@gmail.com | resident |
| Priya Nair | priya.nair@gmail.com | resident |
| Sanjay Mehta | sanjay.mehta@outlook.com | resident |
| Vikram Patel | vikram.patel@gmail.com | resident (NRI — USD payments) |

---

## Useful Make commands

```bash
make up          # start all services
make down        # stop (data preserved)
make reset       # ⚠ wipe volumes and start fresh
make logs        # tail all logs
make logs-db     # postgres logs only
make logs-kc     # keycloak logs only
make ps          # health status
make shell-db    # psql into society_events
make shell-redis # redis-cli
make seed        # re-run seed (idempotent)
```

---

## Directory layout

```
society-events/
├── docker-compose.yml
├── .env.example
├── Makefile
├── db/
│   ├── init/
│   │   ├── 00_create_keycloak_db.sh   ← creates keycloak DB
│   │   ├── 01_schema.sql              ← all DDL + indexes
│   │   └── 02_seed.sql                ← dummy data + views
│   └── pgadmin/
│       └── servers.json               ← pre-wired server list
└── keycloak/
    └── realm.json                     ← auto-imported realm + test users
```

Postgres runs the `db/init/` scripts in filename order on first boot only.
If you modify the schema after the first boot, use `make reset` to rebuild.

---

## Keycloak OAuth 2.0 integration notes

The realm ships with two clients:

**`society-frontend`** (public, PKCE) — use this in your React/Vue/Angular
micro-frontend. Redirect URIs cover ports 3000, 4200, and 5173.

```js
// Example with keycloak-js
const keycloak = new Keycloak({
  url: 'http://localhost:8080',
  realm: 'society-events',
  clientId: 'society-frontend',
});
await keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256' });
// keycloak.token → Bearer token for API calls
// keycloak.tokenParsed.sub → matches users.keycloak_sub in postgres
```

**`society-api`** (confidential, service account) — use this in your
backend microservices to introspect / validate tokens via the JWKS endpoint:

```
http://localhost:8080/realms/society-events/protocol/openid-connect/certs
```

The `sub` claim in every JWT is the `keycloak_sub` column in the `users` table.
Your user service should look up the resident by `keycloak_sub` to resolve
the internal `user.id`.

---

## Payment gateway — Razorpay test mode

For development you don't need real credentials.

1. Sign up free at https://dashboard.razorpay.com → Test mode
2. Copy your test `key_id` and `key_secret`
3. Add to your service's `.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. Use Razorpay's test card `4111 1111 1111 1111`, any future date, CVV 123
5. For UPI test: use `success@razorpay` as the VPA

The `payment` table already stores `gateway_name`, `gateway_order_id`,
`gateway_txn_id`, and the full `gateway_response` JSONB for webhook payloads.

---

## Recommended microservice layout (for when you're ready)

```
services/
├── user-service/        # JWT validation, keycloak_sub → user lookup
├── event-service/       # CRUD for events, registrations, QR generation
├── payment-service/     # Razorpay order creation, webhook handler
├── notification-service/# SMTP via Mailpit (dev) / SES (prod)
└── api-gateway/         # Route + forward Bearer tokens to services
```

All services share the `society_network` Docker network and can reach
each other by container name (`society_postgres`, `society_redis`, etc.).

---

## Resetting the database

```bash
make reset    # tears down volumes, reinitialises schema + seed
```

To only re-seed without wiping:
```bash
make seed     # idempotent — safe to run multiple times
```
