# Mobile OTP Login — Setup Guide

## Overview

Two features were added:

| Feature | Description |
|---------|-------------|
| **Mobile OTP Login** | Existing users log in with their registered phone number + one-time password |
| **Phone Registration** | New users create accounts with username + password + phone (email optional) |

Google login is unchanged and continues to work independently.

---

## Architecture

```
Browser ─► Nginx ─► OTP Bridge Service (port 3003)
                         │
                         ├─► Redis        (OTP storage, HMAC-hashed, 5-min TTL)
                         ├─► User Service (look up user by phone)
                         └─► Keycloak     (token exchange / impersonation)
                               │
                               └─► SMS Gateway (Gammu / personal phone)
```

**Token flow (login):**
1. User enters phone → Bridge sends OTP via SMS
2. User enters OTP → Bridge validates against Redis hash
3. Bridge calls Keycloak Token Exchange (RFC 8693) using `otp-bridge` service account → returns valid Keycloak `access_token`
4. Bridge creates a long-lived **bridge session** in Redis (8 h) as a refresh mechanism
5. Frontend stores `access_token` (5 min) + `session_token` (8 h) in `sessionStorage`
6. Every 60 s the frontend refreshes via `POST /api/otp/refresh` — no client secret ever leaves the server

---

## 1. Environment Variables

Add to your `.env` (copy from `.env.example`):

```env
# OTP Bridge
OTP_BRIDGE_CLIENT_SECRET=<generate: python3 -c "import secrets; print(secrets.token_hex(32))">

# SMS Gateway: "log" (dev), "gammu" (production with USB modem), "disabled"
SMS_GATEWAY=log
```

---

## 2. Database Migration (Existing Deployments)

For any running stack, apply the schema migration **before** redeploying:

```bash
# While the stack is running:
docker compose exec postgres psql \
  -U society_user -d society_events \
  -f /dev/stdin < db/migrations/002_mobile_otp.sql
```

Fresh deployments use the updated `db/init/01_schema.sql` automatically.

**Changes made:**
- `users.username VARCHAR(255) UNIQUE` — set for phone-registered accounts
- `users.email` — changed from `NOT NULL` to nullable (phone-only accounts have no email)
- `users.phone UNIQUE` — prevents duplicate phone registrations
- Partial unique index on email (`WHERE email IS NOT NULL`)

---

## 3. Keycloak Token Exchange Setup

The OTP Bridge uses Keycloak's **RFC 8693 Token Exchange** so it can generate valid Keycloak access tokens for OTP-verified users **without touching their passwords**.

### 3a. Fresh deployments

Everything is pre-configured in `keycloak/realm.json`:
- `otp-bridge` client with `serviceAccountsEnabled: true`
- Service account user with `impersonation` role from `realm-management`
- Keycloak started with `--features=token-exchange`

### 3b. Existing deployments (realm already imported)

Since Keycloak only imports the realm once, run these Admin CLI commands:

```bash
# Shell into Keycloak container
docker compose exec keycloak bash

# Authenticate as admin
/opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8081 \
  --realm master \
  --user "$KEYCLOAK_ADMIN" \
  --password "$KEYCLOAK_ADMIN_PASSWORD"

# Create otp-bridge client
/opt/keycloak/bin/kcadm.sh create clients \
  -r society-events \
  -s clientId=otp-bridge \
  -s enabled=true \
  -s publicClient=false \
  -s serviceAccountsEnabled=true \
  -s directAccessGrantsEnabled=false \
  -s "secret=$OTP_BRIDGE_CLIENT_SECRET"

# Grant impersonation role to its service account
/opt/keycloak/bin/kcadm.sh add-roles \
  -r society-events \
  --uusername service-account-otp-bridge \
  --cclientid realm-management \
  --rolename impersonation
```

Then restart Keycloak with the `--features=token-exchange` flag (already set in `docker-compose.yml`):

```bash
docker compose up -d --force-recreate keycloak
```

---

## 4. SMS Gateway — Gammu with Android Phone

Gammu can send SMS using an Android phone connected via USB in modem mode (works on most Android 9+ phones without root).

### 4a. Install Gammu on the Docker host

```bash
# Ubuntu/Debian
sudo apt-get install gammu gammu-smsd

# Fedora/RHEL
sudo dnf install gammu
```

### 4b. Enable USB tethering on your Android phone

1. Connect phone to PC via USB cable
2. On phone: Settings → Network → USB Tethering (or Mobile Hotspot & Tethering)
3. Enable **USB Tethering**

The phone appears as `/dev/ttyUSB0` or `/dev/ttyACM0` on Linux.

```bash
# Verify device
ls /dev/tty{USB,ACM}*
# Expected: /dev/ttyUSB0 or /dev/ttyACM0
```

### 4c. Identify your phone with Gammu

```bash
sudo gammu-detect
# Outputs a sample .gammurc — copy the relevant section
```

### 4d. Create Gammu config

```ini
# /etc/gammurc  (or gammu-config/gammurc on the host, mounted into container)
[gammu]
device = /dev/ttyUSB0
connection = at
```

Test before using in Docker:
```bash
sudo gammu --identify
echo "Test OTP" | sudo gammu sendsms TEXT +91XXXXXXXXXX
```

### 4e. Enable USB device in docker-compose

In `docker-compose.yml`, uncomment the `devices` block in `otp-service`:

```yaml
otp-service:
  devices:
    - /dev/ttyUSB0:/dev/ttyUSB0   # or /dev/ttyACM0
```

And set in `.env`:
```env
SMS_GATEWAY=gammu
USB_MODEM_DEVICE=/dev/ttyUSB0
```

### Alternative: Kannel / PlaySMS / HTTP gateway

Replace `services/otp/app/sms.py → _gammu()` with an HTTP call to any SMS provider:

```python
async def _http_sms_gateway(phone: str, message: str) -> bool:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "http://your-sms-provider/send",
            json={"to": phone, "text": message, "apikey": "..."},
        )
        return r.status_code == 200
```

---

## 5. Connecting the Phone as SMS Gateway

**Reliability notes (personal phone limitations):**

| Scenario | Impact | Mitigation |
|----------|--------|------------|
| Phone sleeps / screen off | USB modem may disconnect | Keep screen on + disable USB sleep |
| Phone reboots | Gateway unavailable temporarily | OTP Bridge retries gracefully; user sees error and can try again |
| USB cable disconnects | No SMS | Monitor `/dev/ttyUSB*` — set an alert |
| SIM out of credit | No SMS | Monitor with a low-balance alert from your carrier |

**Keep connection stable:**
```bash
# On Android, enable "Stay awake while charging" (Developer Options)
# Or use adb:
adb shell svc power stayon usb
```

**Production recommendation:** For production use, switch to a cloud SMS API (Twilio, AWS SNS, MSG91, etc.) by replacing the gateway implementation in `sms.py`. The abstraction layer is intentionally simple.

---

## 6. Security Checklist

| Item | Implementation |
|------|---------------|
| OTP expires after 5 min | Redis TTL = 300 s |
| OTP invalidated on first use | Deleted from Redis immediately on success |
| Max 3 wrong attempts | Attempt counter in Redis; OTP deleted on 3rd failure |
| 1 OTP per minute per phone | Separate Redis rate-limit key with 60 s TTL |
| OTP never stored in plain | HMAC-SHA256(phone:otp, INTERNAL_API_KEY) |
| Nginx rate limit on OTP endpoints | `zone=otp 3r/m` — 3 OTP requests per minute per IP |
| Token exchange server-side only | Client secret for `otp-bridge` never sent to browser |
| Bridge session revoked on logout | `DELETE otp:session:{token}` in Redis |
| Google login unaffected | Completely separate Keycloak flow; OTP is optional |

---

## 7. Testing Scenarios

### OTP Login
```bash
# 1. Send OTP (replace with a registered user's phone)
curl -X POST http://localhost:8080/api/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210"}'

# 2. Verify OTP (use OTP from SMS or logs if SMS_GATEWAY=log)
curl -X POST http://localhost:8080/api/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "otp": "123456"}'
```

### Phone Registration
```bash
# 1. Send registration OTP
curl -X POST http://localhost:8080/api/otp/register/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543211"}'

# 2. Confirm registration
curl -X POST http://localhost:8080/api/otp/register/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543211",
    "otp": "654321",
    "username": "john_doe",
    "password": "Secure@123",
    "name": "John Doe",
    "email": "john@example.com"
  }'
```

### Test Scenarios from Checklist

| Test | How |
|------|-----|
| Expired OTP | Wait 5 min after requesting OTP, then try to verify |
| Wrong OTP 3× | Enter wrong OTP 3 times — should get "Too many attempts" |
| Duplicate phone | Try to register an already-registered phone |
| Register without optional fields | Omit `name`, `email`, `flat_number` in registration |
| Concurrent OTP requests | Request OTP twice within 60 s — second should get 429 |
| SMS gateway offline | Set `SMS_GATEWAY=disabled`, request OTP — system should still store OTP; log shows it |

---

## 8. Account Recovery

**If a user loses phone access:**
1. They can log in with their **username + password** via the standard Keycloak login page
2. Or use their **Google account** (if linked via same email)
3. Admin can manually activate account and reset credentials via `/admin/users`

**Audit logging:** All OTP generation and verification attempts are logged to the OTP Bridge service stdout (and to Splunk if configured). Failed verification attempts include the phone number and timestamp for abuse investigation.

---

## 9. Limitations

- **Personal phone SMS gateway is not production-grade** — it depends on a single phone's USB connection and mobile network. For production, use a cloud SMS API.
- **Token Exchange requires Keycloak 24+** with `--features=token-exchange` enabled.
- **OTP is SMS-only** — no email or TOTP fallback currently. Future enhancement.
- **Phone numbers are global** — one phone number = one account across the entire society.
