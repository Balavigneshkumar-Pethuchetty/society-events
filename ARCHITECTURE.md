# Society Events — Architecture

## Overview

**6 backend microservices** + **5 micro frontends**, connected through a central API Gateway and Keycloak for auth. Each service owns its domain of the DB schema.

---

## Microservices

| # | Service | Port | Owns Tables | Scales For |
|---|---------|------|-------------|------------|
| 1 | API Gateway | 8000 | — | All traffic, JWT validation |
| 2 | User Service | 3001 | users, apartment, oauth_session | Profile reads/writes |
| 3 | Event Service | 3002 | event, event_category, society | High read traffic |
| 4 | Registration Service | 3003 | registration | Registration bursts |
| 5 | Payment Service | 3004 | payment, refund, currency, exchange_rate | Payment + webhooks |
| 6 | Notification Service | 3005 | notification, announcement | Email + push volume |

---

### 1. API Gateway (port 8000)
- Single HTTPS entry point for all clients
- Validates JWT against Keycloak JWKS endpoint before forwarding
- Routes by path prefix: `/users/*` → User Service, `/events/*` → Event Service, etc.
- Rate limiting, CORS, request logging
- **Technology:** NGINX + Kong or Traefik

### 2. User Service (port 3001)
- Resolves `keycloak_sub` (JWT `sub` claim) → internal `users.id`
- Profile CRUD, apartment assignment, role management
- Every other service calls this to resolve user identity
- **Technology:** Python / FastAPI

### 3. Event Service (port 3002)
- Full event lifecycle: `draft → published → completed/cancelled`
- Category management, full-text search via `pg_trgm` GIN index
- Highest read traffic — scale with read replicas + Redis cache
- **Technology:** Node.js / Go

### 4. Registration Service (port 3003)
- Register/cancel for events (enforces capacity, uniqueness per user per event)
- Generates QR codes (base64 token) for ticket entry
- Attendance marking for security guards (scan QR → mark `attended`)
- Publishes `registration.confirmed` to message queue → triggers Notification Service
- **Technology:** Node.js / Go

### 5. Payment Service (port 3004)
- Creates Razorpay orders; returns `order_id` + `key_id` to frontend
- Verifies payment HMAC signature after Razorpay callback
- Handles Razorpay webhooks (idempotent via `gateway_txn_id` uniqueness)
- Multi-currency: converts foreign → INR using `exchange_rate` table
- Processes full and partial refunds
- Publishes `payment.success` / `payment.refunded` to message queue
- **Technology:** Node.js / Go

### 6. Notification Service (port 3005)
- Listens on message queue for events from other services
- Creates `notification` rows (drives the in-app bell icon)
- Sends emails via SMTP (Mailpit in dev, SES/SendGrid in prod)
- Broadcasts announcements to all event registrants
- **Technology:** Node.js / Go

### Inter-service communication
- **Synchronous:** REST over HTTP (internal `society_network`, no auth needed)
- **Async:** Redis Pub/Sub (dev) → RabbitMQ or AWS SQS (prod)

---

## Micro Frontends

| # | MFE | Routes | Key Pages |
|---|-----|--------|-----------|
| 1 | Shell (host) | / | Nav, auth, notification bell |
| 2 | Events MFE | /events/* | Listing, search, event detail |
| 3 | Booking MFE | /tickets/* | My tickets, QR viewer, cancel |
| 4 | Payment MFE | /checkout/* | Checkout, payment history |
| 5 | Admin MFE | /admin/* | Dashboard, event CRUD, reports |

**Module Federation** (Webpack 5 / Vite + `@originjs/vite-plugin-federation`)

```
Shell App (host)
├── Events MFE       (lazy loaded)
├── Booking MFE      (lazy loaded)
├── Payment MFE      (lazy loaded)
└── Admin MFE        (lazy, role-gated: admin | committee_member only)
```

### 1. Shell App
- Bootstraps Keycloak JS, handles login/logout, silent token refresh
- Top-level router, global nav: logo, category links, notification bell, avatar
- Provides shared context: `AuthContext` (user, token), `SocietyContext`
- Polls `/notifications?unread=true` for the bell badge count

### 2. Events MFE
- `/events` — paginated grid with category filter chips + search bar
- `/events/:id` — banner, description, announcements section, registration card

### 3. Booking MFE
- `/tickets` — all my registrations with status badges
- `/tickets/:id` — QR code full-screen display for scan at entry gate

### 4. Payment MFE
- `/checkout/:registrationId` — order summary, currency picker, Razorpay SDK
- `/payments` — payment history, invoice download

### 5. Admin MFE
- `/admin/events` — event table with CRUD actions
- `/admin/events/new` and `/admin/events/:id/edit` — event form
- `/admin/users` — user list, role management
- `/admin/reports` — revenue charts, registration stats
- `/admin/announcements` — compose + send to all registrants

---

## Shared Packages (monorepo / npm workspaces)

```
packages/
├── ui-kit/        — Button, Card, Badge, Input, Modal components
├── auth-context/  — Keycloak JS wrapper, useAuth() hook
├── api-client/    — typed fetch wrappers per service
└── types/         — shared TypeScript interfaces (Event, User, Registration…)
```

---

## Deployment Topology

```
Windows Browser
      │
      │  localhost:3000 (dev)
      ▼
┌──────────────────────────────────────────┐
│         Shell App  (Vite / React)        │
│  lazy-loads MFEs via Module Federation   │
└────────────────────┬─────────────────────┘
                     │  API calls
                     ▼  localhost:8000
┌──────────────────────────────────────────┐
│              API Gateway                 │
│  validates JWT → routes to service       │
└──┬─────────┬────────┬───────┬────────┬──┘
   ▼         ▼        ▼       ▼        ▼
User Svc  Event Svc Reg Svc Pay Svc Notif Svc
:3001     :3002     :3003   :3004    :3005
   │         │        │       │        │
   └─────────┴────────┴───────┴────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
     PostgreSQL     Redis      Keycloak
       :5432        :6379       :8080
```

---

## Scaling Notes

| Concern | Solution |
|---------|----------|
| Event listing is high traffic | Redis cache for `/events` list; invalidate on publish/cancel |
| Registration burst (popular event) | Horizontal scale; DB `UNIQUE(event_id, user_id)` prevents double-booking |
| Payment webhook replay | `gateway_txn_id UNIQUE` constraint makes handlers idempotent |
| Notification spikes | Async queue absorbs bursts; service scales independently |
| Multi-society SaaS later | `society_id` FK on every major table; tenant isolation via gateway routing |
| NRI currency | Exchange rate locked at payment time (`exchange_rate_id` on payment row) |
