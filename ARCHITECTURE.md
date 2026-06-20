# Society Events — Architecture

## Overview

**7 backend microservices** + **6 micro frontends**, connected through a central API Gateway and Keycloak for auth. Each service owns its domain of the DB schema.

---

## Microservices

| # | Service | Port | Owns Tables | Status |
|---|---------|------|-------------|--------|
| 1 | API Gateway (nginx) | 8080 | — | ✅ Implemented |
| 2 | User Service | 3001 | users, apartment, notification, oauth_session | ✅ Implemented |
| 3 | Event Service | 3002 | event, event_category, announcement, sponsor, event_sponsorship, event_expense, complimentary_ticket, vendor | ✅ Implemented |
| 4 | Registration Service | 3005 | registration, payment, cart | ✅ Implemented |
| 5 | Ticket Service | 3006 | ticket | ✅ Implemented |
| 6 | Notification Service | — | notification (async dispatch) | 🔲 Planned |

## Micro Frontends

| MFE | Port | Route | Purpose | Status |
|-----|------|-------|---------|--------|
| shell | 3000 | `/` | Host + auth + nav | ✅ Implemented |
| mfe-events | 4001 | `/events/*` | Event discovery + registration start | ✅ Implemented |
| mfe-booking | 4002 | `/registrations/*` | Registration tracking + payment uploads | ✅ Implemented |
| mfe-payment | 4003 | `/checkout/*`, `/payments/*` | Checkout + UPI QR + screenshot upload | ✅ Implemented |
| mfe-admin | 4004 | `/admin/*`, `/manage/*` | Admin console + payment approvals | ✅ Implemented |
| mfe-tickets | 4005 | `/tickets/*` | Confirmed tickets + gate-entry QR display | ✅ Implemented |

---

## ✅ 1. API Gateway — nginx (port 8080)

Single HTTPS entry point for all clients. Handles routing, rate limiting, and security hardening.

### Routing
- `/realms/` → Keycloak (OIDC login, token exchange, broker endpoints)
- `/resources/`, `/js/` → Keycloak static assets
- `/api/users/` → User Service (`:3001`) — path prefix stripped before forwarding
- `/pgadmin/` → pgAdmin (basic auth protected)
- `/splunk/` → Splunk UI (basic auth protected)
- `/mfe-admin/`, `/mfe-events/`, `/mfe-booking/`, `/mfe-payment/` → individual MFE containers
- `/` → Shell App (main frontend)

### Rate Limiting
- `general` zone — 30 req/s per IP (API + frontend traffic)
- `auth` zone — 5 req/s per IP (Keycloak endpoints, burst=20)
- `admin` zone — 10 req/s per IP (pgAdmin, Splunk, burst=15)

### Security
- `X-Content-Type-Options: nosniff` on all responses
- `X-XSS-Protection: 1; mode=block` on all responses
- `Referrer-Policy: strict-origin-when-cross-origin` on all responses
- `Permissions-Policy: geolocation=(), microphone=(), camera=()` on all responses
- Hard block on `.php`, `.asp`, `.aspx`, `.jsp`, `.cgi` requests (→ 404)
- Hard block on `wp-admin`, `wp-login`, `phpmyadmin`, `xmlrpc.php`, `/etc/passwd` (→ 404)
- Hard block on `.git`, `.env`, `.svn`, `.ssh`, `.htaccess` file access (→ 404)
- IP allowlist on Swagger docs and internal health endpoint (localhost + RFC-1918 only)
- Cloudflare `CF-Visitor` header detection for real scheme (`http`/`https`) forwarding

### Caching
- `remoteEntry.js` for all MFEs served with `Cache-Control: no-cache, no-store` — ensures the browser always fetches the latest module federation manifest after a rebuild

### Health
- `GET /nginx-health` — internal liveness probe (IP-restricted to Docker network)

---

## ✅ 2. User Service — FastAPI / Python (port 3001)

Owns resident identity, apartment assignment, role lifecycle, and in-app notifications.

### Public Endpoints (no auth)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/users/forgot-password` | Send password-reset email via Keycloak Admin API. Validates email exists in DB, checks account is active, and rejects social-login accounts (no password to reset). |
| GET | `/society` | Return society name, short name, and city (read from env). Used by the frontend `SocietyContext`. |
| GET | `/health` | Liveness probe — pings PostgreSQL and returns `{ status: "ok" }`. |
| POST | `/frontend-logs` | Proxy JS error payloads from the browser to Splunk HEC, keeping the HEC token server-side. |

### Authenticated Endpoints (valid Keycloak JWT required)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/users/sync` | Upsert the calling user into the local `users` table from their JWT claims (first login provisioning). Creates admin notifications for new registrations. |
| GET | `/users/me` | Return the caller's own profile including apartment and role. |
| PUT | `/users/me` | Update own profile fields (name, phone). |
| PUT | `/users/me/apartment` | Self-assign an apartment unit. |
| GET | `/users/apartments/list` | List all apartments in the society for the apartment picker. |
| GET | `/notifications` | List the caller's notifications. Supports `?unread=true` filter and pagination (`limit`, `offset`). |
| PATCH | `/notifications/{id}/read` | Mark a single notification as read. |
| PATCH | `/notifications/read-all` | Mark all of the caller's notifications as read. |

### Admin / Committee Endpoints (role-gated)
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/users` | admin, committee_member | List all users with optional `role` and `is_active` filters; paginated. |
| GET | `/users/admin-stats` | admin, committee_member | Approval/rejection/revocation counts per admin, plus last 20 admin actions. |
| GET | `/users/{user_id}` | any (own profile) / admin+committee | Fetch user by internal UUID. Residents can only view their own record. |
| PATCH | `/users/{user_id}/role` | admin | Update the user's role in both the local DB and Keycloak realm roles. |
| PATCH | `/users/{user_id}/active` | admin | Activate or deactivate a user account. |
| POST | `/users/{user_id}/approve` | admin | Approve a pending registration — assigns Keycloak realm role and sets `is_active = TRUE`. |
| DELETE | `/users/{user_id}/reject` | admin | Reject and delete a pending registration from DB. |
| DELETE | `/users/{user_id}` | admin | Permanently remove an active user from DB and Keycloak. |
| PATCH | `/users/{user_id}/revoke` | admin | Revoke access — sets `is_active = FALSE` and strips all Keycloak realm roles. |

### Internal Endpoints (X-Internal-Key header required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/internal/users/by-sub/{keycloak_sub}` | Resolve Keycloak `sub` claim → internal user record. Used by other services. |
| GET | `/internal/users/by-id/{user_id}` | Resolve internal UUID → user record. |

### Observability (Splunk integration)
- `SplunkLoggingMiddleware` — classifies every request into `society_security`, `society_app_errors`, or `society_web_access` Splunk indexes. Fire-and-forget via `asyncio.create_task`; zero impact when Splunk is down.
- `metrics_collector` — ships host CPU % and memory stats to `society_metrics` index every 60 s.
- Both components short-circuit immediately when `SPLUNK_HEC_TOKEN` is unset.

### Auth & Security
- JWT validation via Keycloak JWKS endpoint (5-minute in-process cache)
- PKCE + Keycloak role-based access control (`require_role` dependency factory)
- Keycloak Admin API calls (obtain token, assign roles, delete users) are isolated to helper functions
- All admin actions persisted to `admin_actions` audit table

---

## ✅ 3. Event Service — FastAPI / Python (port 3002)

Owns the full event lifecycle and all event-related content.

### Event Lifecycle Management
- Create event (title, description, venue, start/end time, capacity, ticket price, currency, category)
- Save as **draft** — visible only to the organiser and admins
- **Publish** — makes the event visible to all residents; triggers `event.published` notification
- **Cancel** — closes registrations; triggers `event.cancelled` notification to all registrants
- **Complete** — manual or auto-trigger after end time; triggers registration status update
- Edit event details (allowed in draft and published states)
- Delete event (draft only; published events must be cancelled first)

### Category Management
- List all categories for the society (name, icon, colour hex)
- Create / update / delete categories (admin only)
- Filter events by one or more categories

### Event Discovery & Search
- Paginated event listing (default filter: `status = published`)
- Full-text search on title using PostgreSQL `pg_trgm` GIN index
- Filter by category, date range, free/paid, status
- Sort by start date, newest first, or registration count
- Single event detail — description, organiser, venue, capacity remaining, price, announcements
- Real-time remaining seat count (capacity − confirmed registrations)
- Sold-out flag when remaining seats reach zero

### Announcements
- Post announcements against a specific event (organiser / committee member)
- List announcements on the event detail page in reverse-chronological order
- Emit `announcement.posted` → Notification Service alerts all confirmed registrants

### Sponsor Management
- Link one or more sponsors to an event with pledged amount and currency
- Track sponsorship status: `pledged → received → refund_requested → refunded`
- Raise and review sponsorship refund requests (organiser approves/rejects)

### Expense Tracking
- Log cost items per event (venue, catering, equipment, marketing, staff, other)
- Attach receipt URL per line
- Aggregate total expenses for the admin finance view

### Complimentary Tickets
- Allocate free-entry passes by organiser, committee member, or sponsor
- Track inviter type and ticket count per allocation
- Support walk-in entries with no account requirement

### Vendor Management
- Invite vendors to an event with category (food, beverages, merchandise, games, services)
- Assign stall number and fee type: `fixed`, `revenue_share %`, or `free`
- Track actual vendor revenue after event completion
- Manage status: `invited → confirmed → cancelled`
- Revenue distribution: collect vendor fees into a pool, approve, and distribute to sponsors / organiser / society via `distribution_entry` rows

### Caching
- Redis cache for the published event listing; invalidated on publish, cancel, or completion
- Read replica routing for all read queries (listing, detail, search)

### Inter-service Events Published
| Event | Consumed by |
|-------|-------------|
| `event.published` | Notification Service → bell notification to all residents |
| `event.cancelled` | Notification Service → alert all registrants |
| `event.completed` | Registration Service → mark confirmed registrations as attended |

---

## ✅ 4. Registration Service — Python/FastAPI (port 3005)

Owns the full booking lifecycle: seat reservation → manual payment → admin review → gate entry.

### Registration
- Register for a published event (enforce capacity, uniqueness per user per event via DB constraint)
- Support `ticket_count > 1` for family group bookings
- Calculate `total_amount` based on ticket price × ticket count
- Cancel own registration (if event not yet started)
- Admin / organiser cancel any registration

### Manual Payment Flow
- Free events: confirm immediately; Ticket Service lazily issues QR ticket on next `/tickets/my` call
- Paid events: `pending_payment` → user uploads UPI screenshot → `pending_review` → admin approves/rejects
- Rejected payments reset to `pending_payment` with a review note
- Admin endpoint: `PATCH /registrations/{id}/review` (approve | reject)
- Payment screenshots stored in `/app/uploads/payment-screenshots/` (Docker volume `registration_uploads`)
- Society UPI/bank details served from `GET /payment-config`

### UPI Payment QR
- `GET /registrations/{id}/payment-qr` — SVG QR encoding the UPI deep-link (`upi://pay?pa=…&am=…`)
- Amount is pre-filled so the user cannot modify it in their UPI app

### Cart
- `PUT /registrations/cart` — upsert (one cart per user, replaces on new selection)
- `GET /registrations/cart` — read saved cart (404 if empty)
- `DELETE /registrations/cart` — cleared on successful registration

---

## ✅ 5. Ticket Service — Python/FastAPI (port 3006)

Owns the ticket lifecycle: issuance on registration confirmation, QR code generation, and gate-entry scanning.

### Ticket Issuance
- **Lazy issuance**: when `GET /tickets/my` is called, the service scans for any confirmed registrations that don't have a ticket yet and issues them automatically (idempotent — `ON CONFLICT DO NOTHING`)
- Reuses existing `registration.qr_code` if present (backward compat for registrations confirmed before this service existed)
- One ticket per registration (`UNIQUE(reg_id)` constraint)

### QR Code Display
- `GET /tickets/my` — returns all active + used tickets for the calling user
- `GET /tickets/{id}/qr` — serves an SVG QR code (`image/svg+xml`) encoding the ticket's `qr_token`
- Used by **mfe-tickets** "Show Ticket" button to display the gate-entry QR in a full-screen dialog
- Cancelled tickets return `400`; QR is not served

### Gate-Entry Scanning
- `POST /tickets/scan` — accepts `{ token }` (security guard scans QR)
  - Finds ticket by `qr_token`; validates it is `active`
  - Marks `ticket.status = 'used'`, records `scanned_at` and `scanned_by`
  - Also updates `registration.status = 'attended'` for cross-service consistency
  - Already-scanned tickets return the existing record with `already_scanned: true` (idempotent)
- Requires role: `admin`, `committee_member`, or `security_guard`

### Ticket Management
- `GET /tickets/{id}` — owner or privileged roles can view a single ticket
- `DELETE /tickets/{id}` — admin only; cannot cancel a `used` ticket
- `status` values: `active` → `used` (on scan) | `cancelled` (by admin)

---

## 🔲 6. Payment Service — Node.js (port 3004)

Owns the payment transaction lifecycle, refunds, and multi-currency conversion.

### Payment Initiation
- Create a Razorpay order for a confirmed registration; return `order_id` + `key_id` to frontend
- Lock exchange rate at order creation time (stored as `exchange_rate_id` on the payment row)
- Support multi-currency display (NRI residents pay in USD/GBP, settled in INR)

### Payment Verification
- Verify Razorpay HMAC signature on frontend callback
- Idempotent handling — `gateway_txn_id UNIQUE` constraint prevents duplicate credits
- Store full webhook payload in `gateway_response JSONB`

### Webhooks
- Handle Razorpay `payment.captured` webhook → mark payment `success`, publish `payment.success`
- Handle `payment.failed` → mark payment `failed`
- Replay-safe via `gateway_txn_id` uniqueness check

### Refunds
- Initiate full or partial refund via Razorpay Refunds API
- Two-amount model mirrors payment: `original_refund_amount` (user-facing) + `settled_refund_amount` (INR)
- Track refund status: `pending → processed / failed`
- Publish `payment.refunded` on success

### Multi-currency
- `currency` table lists supported codes
- `exchange_rate` table stores `from_currency`, `to_currency`, `rate`, `valid_from`
- Rate locked at payment time; historical rate preserved on the payment row

### Inter-service Events Published
| Event | Consumed by |
|-------|-------------|
| `payment.success` | Registration Service → confirm booking; Notification Service → receipt |
| `payment.refunded` | Registration Service → cancel booking; Notification Service → refund notice |

---

## 🔲 6. Notification Service — Node.js (port 3005)

Async consumer — listens on the message queue and dispatches in-app + email notifications.

### In-app Notifications
- Insert `notification` rows (drives the bell icon badge count in the Shell App)
- Types: `registration_confirmed`, `payment_success`, `event_reminder`, `event_cancelled`, `refund_processed`, `announcement`, `new_registration` (admin only)
- Mark as read via User Service endpoints

### Email Dispatch
- Send transactional emails via SMTP (Mailpit in dev, Gmail / SES in prod)
- Templates: registration confirmation, payment receipt, event cancellation, refund processed, password reset, announcement broadcast

### Queue Consumers
| Message | Action |
|---------|--------|
| `event.published` | Bell notification to all society residents |
| `event.cancelled` | Email + bell to all registrants of that event |
| `registration.confirmed` | Confirmation email + bell to the registrant |
| `registration.cancelled` | Cancellation notice email + bell to the registrant |
| `payment.success` | Payment receipt email + bell to the payer |
| `payment.refunded` | Refund confirmation email + bell to the payer |
| `announcement.posted` | Bell notification to all confirmed registrants of the event |

### Event Reminder (scheduled)
- Cron-triggered 24 h before event start → email + bell reminder to all confirmed registrants

### Inter-service Communication
- **Synchronous:** REST over HTTP on `society_network` (no auth required inside Docker)
- **Async (dev):** Redis Pub/Sub
- **Async (prod):** RabbitMQ or AWS SQS

---

## Micro Frontends

| # | MFE | Routes | Key Pages |
|---|-----|--------|-----------|
| 1 | Shell (host) | / | Nav, auth, notification bell |
| 2 | Events MFE | /events/* | Listing, search, event detail |
| 3 | Booking MFE | /tickets/* | My tickets, QR viewer, cancel |
| 4 | Payment MFE | /checkout/* | Checkout, payment history |
| 5 | Admin MFE | /admin/* | Dashboard, event CRUD, reports |

**Module Federation** (Vite + `@originjs/vite-plugin-federation`)

```
Shell App (host) — port 3000
├── Events MFE       (lazy loaded) — port 4001
├── Booking MFE      (lazy loaded) — port 4002
├── Payment MFE      (lazy loaded) — port 4003
└── Admin MFE        (lazy, role-gated: admin | committee_member) — port 4004
```

### Shell App
- Bootstraps Keycloak JS, handles login/logout/Google SSO, silent token refresh
- Top-level router, global nav: logo, category links, notification bell, avatar menu
- Provides `AuthContext` (user, token, login, loginWithGoogle, register, logout) and `SocietyContext`
- Polls `/api/users/notifications?unread=true` for bell badge count

### Events MFE
- `/events` — paginated grid with category filter chips + full-text search bar
- `/events/:id` — banner, description, announcements section, registration card

### Booking MFE
- `/tickets` — all my registrations with status badges
- `/tickets/:id` — full-screen QR code display for gate scan

### Payment MFE
- `/checkout/:registrationId` — order summary, currency picker, Razorpay SDK integration
- `/payments` — payment history with invoice download

### Admin MFE
- `/admin/events` — event table with full CRUD actions
- `/admin/events/new` and `/admin/events/:id/edit` — event form
- `/admin/users` — user list, approval queue, role management
- `/admin/reports` — revenue charts, registration stats, expense summaries
- `/admin/announcements` — compose and send to all event registrants

---

## Deployment Topology

```
Browser (public domain or LAN)
         │
         │  https://gm-global-techies-town.club  (prod)
         │  http://localhost:8080                (dev)
         ▼
┌─────────────────────────────────────────────────────┐
│            Cloudflare Tunnel (cloudflared)           │
│     routes public HTTPS → nginx on society_net       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│         nginx — API Gateway  (port 8080)             │
│  Rate limiting · Security headers · Path routing     │
└──┬──────────┬──────────┬────────┬────────┬──────────┘
   ▼          ▼          ▼        ▼        ▼
User Svc   Event Svc  Reg Svc  Pay Svc  Notif Svc
:3001      :3002      :3003    :3004    :3005
✅ Built   ✅ Built   🔲Planned🔲Planned🔲 Planned
   │          │          │        │        │
   └──────────┴──────────┴────────┴────────┘
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
        PostgreSQL      Redis     Keycloak
          :5432         :6379      :8081
```

---

## Scaling Notes

| Concern | Solution |
|---------|----------|
| Event listing is high traffic | Redis cache for `/events` list; invalidate on publish / cancel / complete |
| Registration burst (popular event) | Horizontal scale; `UNIQUE(event_id, user_id)` in DB prevents double-booking |
| Payment webhook replay | `gateway_txn_id UNIQUE` constraint makes handlers idempotent |
| Notification spikes | Async queue absorbs bursts; Notification Service scales independently |
| Multi-society SaaS later | `society_id` FK on every major table; tenant isolation at gateway routing layer |
| NRI currency | Exchange rate locked at payment time via `exchange_rate_id` on the payment row |
