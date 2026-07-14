# Society Events — Architecture

This document describes what is actually built and wired up today. For dev commands, DB
migration conventions, the module-federation routing convention, and the Cloudflare tunnel,
see [CLAUDE.md](CLAUDE.md) — this file focuses on **what each service/page actually does**.

## Overview

**5 backend microservices** (all Python/FastAPI) + **1 shell + 5 micro-frontends**, behind a
single nginx gateway. All backend services share one PostgreSQL database (`society_events`);
see CLAUDE.md's "single-tenant, shared-database" note for why cross-service direct table
writes are the norm here, not a bug.

| Service | Port | Nginx prefix |
|---|---|---|
| user-service | 3001 | `/api/users/` |
| event-service | 3002 | `/api/events/` |
| registration-service | 3005 | `/api/registrations/` (includes `/complimentary/*`) |
| ticket-service | 3006 | `/api/tickets/` |
| payment-service | 3007 | `/api/payments/` |

## Backend services

### user-service (3001)

Identity, roles, building/unit structure, notifications.

- **Users**: Keycloak-JWT sync/upsert on first login, own-profile get/update, apartment/unit self-assignment, admin listing with role/active filters, approve/reject pending registrations, role change, activate/deactivate/revoke (with Keycloak realm-role sync), permanent delete. All admin mutations are written to an `admin_actions` audit table.
- **Building structure**: configurable hierarchy level names, structure-node tree CRUD, unit-assignment request workflow (resident requests a flat, admin approves/rejects).
- **Notifications**: list (with unread filter), mark one/all read — drives the bell icon.
- **Auth-adjacent**: `POST /users/forgot-password` delegates to Keycloak's Admin API to send the reset email (no SMTP of its own here).
- **Internal-only** (`X-Internal-Key` header): resolve Keycloak `sub` → user, or internal UUID → user, for other services.

### event-service (3002)

Event lifecycle + content. Does **not** own registrations, tickets, or payments.

- **Events**: paginated/filterable listing, detail, create (starts as `draft`), update, publish, cancel, complete, delete (draft only). `cancel_freeze_at` (self-cancel deadline) is validated to always be before `start_time`.
- **Categories**: CRUD.
- **Announcements**: per-event, reverse-chronological.
- **Ticket types**: per-event named ticket tiers (price, free/paid, capacity, sort order, active flag).
- **Dead code**: `app/routes/registrations.py` exists in this service but is **not mounted** in `main.py` (only `events` and `categories` routers are). Don't be misled by its presence — registrations are entirely owned by `registration-service`.

### registration-service (3005)

Owns the booking lifecycle end to end: cart → registration → payment review → complimentary tickets → cancellation.

- **Cart**: one saved cart per user (`PUT`/`GET`/`DELETE /registrations/cart`), cleared on successful registration.
- **Registration**: create (free events auto-confirm; paid events start `pending_payment`), list own, get one, cancel. A user may hold **multiple** registrations for the same event (no uniqueness constraint — e.g. buying an extra ticket for a guest is allowed). Cancelling a **confirmed** registration is blocked for residents unless the event's `cancel_freeze_at` is unset (always allowed until start) or still in the future; cancelling also cancels the linked `ticket` row and, if a `payment_transaction` was `verified`, flips it to `refund_requested` for the admin refund queue. Cancellation optionally accepts a `refund_upi_id` (the frontend prompts for it) — stored on the transaction, falling back to `payer_upi` from the original payment when omitted.
- **Manual payment (legacy flow)**: UPI QR generation with the amount pre-filled, screenshot upload (`pending_review`), admin `PATCH /registrations/{id}/review` (approve/reject).
- **Complimentary tickets** (`/complimentary/*`, i.e. `/api/registrations/complimentary/*`): admin/committee issue a **real** registration + ticket (QR-scannable, shows up in the normal gate-scan flow) to a named guest on behalf of an organizer/committee member/sponsor, or log an anonymous walk-in headcount (no ticket). Guests without an account get a lightweight placeholder `users` row (`role='guest'`, no `keycloak_sub`, can never log in). Revoke is a soft-cancel (keeps the row for audit, cancels the linked registration+ticket). Named tickets with an email on file can be emailed (QR embedded inline) via Gmail SMTP — see `app/email.py`.

### ticket-service (3006)

Ticket issuance, QR display, gate entry.

- **Lazy issuance**: `GET /tickets/my` scans for the caller's `confirmed` registrations with no ticket yet and issues one on the spot (idempotent). This is how paid/free resident checkouts get a ticket — there's no explicit "issue" call from the checkout flow itself.
- **QR**: `GET /tickets/{id}/qr` is a **public**, unauthenticated SVG endpoint (safe because the QR only contains an opaque token) — used both by residents' "Show Ticket" dialog and by the admin Complimentary Tickets page.
- **Gate entry**: `POST /tickets/scan` (by QR token) or `POST /tickets/{id}/enter` (by ticket ID) mark a ticket `used`, set `scanned_at`/`scanned_by`, and flip the linked registration to `attended`. Idempotent — re-scanning an already-used ticket returns `already_scanned: true` instead of erroring.
- **Roster**: `GET /tickets/event/{event_id}` — full attendee list for an event (security/admin/committee).
- Admin-only `DELETE /tickets/{id}` cancels a ticket directly (can't cancel an already-`used` one) — separate from, and lower-level than, registration-service's cancel flow.

### payment-service (3007)

UPI payment reconciliation and refunds — **not** a Razorpay/card gateway; there is no such integration anywhere in this codebase.

- **Transactions** (`/payments`): initiate, auto-confirm (called by the frontend once a payment is externally verified — see the note below), get/list, manual verify/approve/reject, flag a verified transaction for refund.
- **Refund queue** (`/refunds`): list transactions in `refund_requested` status; admin/committee log the refund UTR to close it out. `GET /refunds/{txn_ref}/qr` generates a scannable `upi://pay` QR (pre-filled payee UPI ID, amount, reference) so the admin can pay from their own UPI app instead of hand-copying details.
- **Reconciliation** (`/reconciliation`, `/recon-settings`): this service has its **own** IMAP-polling + Ollama-LLM screenshot-parsing implementation (`app/reconciliation/`, `aioimaplib` dependency) and its own settings UI (IMAP host/creds, Ollama host/model, test-connection endpoints).
- **Committee registry** (`/registry`): assigns a committee member + UPI ID as the payment collector for a given event; exposes that collector's QR.
- **Audit** (`/audit`): reconciliation status-change log.

**Important gotcha**: the resident-facing checkout UI (`frontend/mfe-payment/src/PaymentApp.tsx`) does **not** call this service for the live QR/screenshot-verification/SSE flow — it calls an entirely separate, external domain (`https://pay.gm-global-techies-town.club`, hardcoded as `PAY_BASE`), which is the **different, standalone** sibling project `~/payment_reconcilation_service` (see CLAUDE.md). The checkout flow only calls back into *this* repo's payment-service for `auto-confirm` (after the external SSE reports success) and for listing payment history. If you're debugging the live checkout/verification experience, you are very likely debugging the wrong codebase if you're only looking at `services/payment` in this repo.

## Frontend

`frontend/shell` (host, port 3000) + 5 independently-buildable module-federation remotes: `mfe-events` (4001), `mfe-booking` (4002), `mfe-payment` (4003), `mfe-admin` (4004), `mfe-tickets` (4005). See CLAUDE.md for the federation/routing convention (URL path → `page`/`id` props → remote dispatcher).

Resident-facing apps (`mfe-events`, `mfe-booking`, `mfe-payment`, `mfe-tickets`) are all real and backend-wired.

### mfe-admin — reality check

`mfe-admin` exposes three route trees (`ManageRoutes` at `/manage/*`, `AdminRoutes` at `/admin/*`, `SponsorApp` at `/sponsor`) and bundles many admin pages — **several of which have no backend at all** and only render hardcoded local state. Before spending time on one of these, check whether it's actually wired up:

| Page | Status |
|---|---|
| `ManageEvents.tsx` | Real — ticket-type CRUD for an event lives inline here, in the `TicketTypesTab` shown inside the Edit Event dialog. |
| `ComplimentaryTickets.tsx` | Real |
| `EventDetails.tsx` | Real for all six tabs — Purchases/Attendance/Complimentary (registration-service, ticket-service) and Finance & Expenses / Vendors / Revenue (payment-service's `funds.py`, added below). Also has Download Excel/PDF and Copy Share Link on the Finance tab. |
| `CollectorRegistry.tsx` | Real |
| `ReconciliationConsole.tsx` | Real |
| `RefundTasks.tsx` | Real |
| `PaymentApprovals.tsx` | Real |
| `UserApproval.tsx` | Real |
| `BuildingStructure.tsx` | Real |
| `UnitManagement.tsx` | Real |
| `SponsorDashboard.tsx` | Real — a sponsor's own view of their sponsorships + refund requests (`payment-service`'s `sponsors.py`). |
| `SponsorManagement.tsx` | Real — sponsor directory CRUD + link sponsor to event. |
| `SponsorshipRefunds.tsx` | Real for the "Sponsorship Refunds" tab (approve/reject/mark-processed). The "Resident Payment Refunds" tab alongside it is still a non-functional placeholder tab — that flow lives at `/pay-refunds` (`RefundTasks.tsx`) instead. |

`payment-service` owns two new route groups beyond payments/refunds/reconciliation/registry:
- **`funds.py`** (`/api/payments/funds/*`): per-event expenses (`event_expense`), the shared vendor directory + per-event assignment (`vendor`/`event_vendor`), revenue distribution pools (`vendor_revenue_distribution`/`distribution_entry`), a finance summary wrapping the `v_event_finance` view, and Excel/PDF export — both an authenticated download and a public, unauthenticated, token-based share link (`fund_export_link` table, same pattern as `ticket-service`'s public QR endpoint).
- **`sponsors.py`** (`/api/payments/sponsors/*`): sponsor directory CRUD, per-event sponsorships (`event_sponsorship`), and the sponsorship refund workflow (`sponsorship_refund`, pending→approved/rejected→processed).

### Event-organizer isolation model (event-service + payment-service)

Per-event management and fund/sponsorship data is scoped to **an event's organizer + explicitly-approved members only — absolute isolation, no admin/committee_member bypass**:

- `event_permission` table (event_id, user_id, granted_by, granted_at, revoked_at) is the delegation mechanism. `GET/POST /events/{id}/permissions` (list/grant) and `DELETE /events/{id}/permissions/{user_id}` (revoke) are organizer-only — approved members don't get to grant further access. Surfaced as a "Manage Access" dialog in both `ManageEvents.tsx` and `mfe-events`' `MyEvents`.
- `require_event_access()` (identical dependency duplicated in `event-service` and `payment-service`'s `auth.py`, since payment-service reads `event`/`event_permission` directly from its own DB connection — this repo's established cross-service direct-table-read pattern) replaces the old `require_role_or_organizer("admin","committee_member")` bypass on: all of `events.py`'s management routes (update/publish/cancel/complete/delete/announcements/ticket-types) and every per-event route in `funds.py`/`sponsors.py` (expenses, vendors, revenue-distribution, export, share-link, sponsorship create/update, refund approve/reject/process).
- **Deliberately left at admin/committee_member** (not per-event data, out of scope): the sponsor *directory* CRUD, `GET /sponsors/{id}/sponsorships` (a sponsor's own cross-event view), `GET /sponsors/refunds` (global queue), and pre-existing cross-event operational consoles (`PaymentApprovals.tsx`, `RefundTasks.tsx`, `ReconciliationConsole.tsx`, `CollectorRegistry.tsx`).
- **Backfill**: migration `021_event_permission_backfill.sql` granted every admin/committee_member `event_permission` on every event that existed before this shipped, so existing access wasn't suddenly revoked. Events created after that migration are isolated from creation — visible only to their organizer until explicitly shared.
- **Deletion**: `DELETE /events/{id}` now also allows `completed` (previously draft-only), for the organizer/an approved member. Pre-launch decision (no production data yet): deletion **fully cascades** — registrations, tickets, payment records, expenses, sponsorships, everything tied to the event is removed together (migration `022_event_delete_cascade_payments.sql` changed `payment_transaction.event_id`'s FK from RESTRICT to CASCADE, which was the last thing blocking it).
- `mfe-events`' `MyEvents` also has a per-event "Funds" view (finance summary, expense log, export/share-link) so an organizer has somewhere to see their own event's money without needing `/manage` access.
