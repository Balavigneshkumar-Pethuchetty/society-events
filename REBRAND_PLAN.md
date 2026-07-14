# Frontend Rebrand: "Event Management" → "Society Management App"

Tracking doc for the frontend-only rebrand decided on 2026-07-10. Scope: **look, feel,
and naming only** — no route, schema, or backend changes. Work top to bottom, one task
at a time; each task is safe to stop after. Check items off as you go and add a line to
the Progress Log at the bottom each session so we can pick back up cleanly.

## Ground rule — two names, don't conflate them

- **Tenant name** ("GM Global Techies Town") — already dynamic, pulled from the `society`
  DB table via `GET /api/users/society` (`SocietyContext.tsx`, `useSocietyConfig.ts`).
  **Do not touch these components' fetch logic** — only their hardcoded `DEFAULT` fallback
  values are candidates for review, and only if Task 0 decides the fallback text should change.
- **Product/app-type name** ("Events" / "Society Events") — static suffix hardcoded
  wherever it's glued onto the tenant name. **This is what actually changes.**

---

## Task 0 — Decisions to lock in before touching any code

- [x] Final app name string: **"GMGT Society Management"**
- [x] Short name/abbreviation for tight spaces: **"GMGT"**
- [x] Confirm branding hierarchy: umbrella app name changes; existing module names (Events, Booking, Payments, Tickets, Admin) stay as-is inside it
- [x] Favicon/logo: add a simple placeholder asset now (generic building/society icon)
- [x] Icon language on the landing page: keep `EmojiEventsIcon`, `EventIcon` as-is (no change)

---

## Task 1 — Shell app branding (highest visibility, do first)

### 1.1 Browser tab / document title
- [x] `frontend/shell/index.html:6` — → `<title>GM Global Techies Town Society Management</title>` (dropped "GMGT" here since it's redundant right next to the spelled-out tenant name)
- [x] `frontend/shell/src/App.tsx:319` — → `` document.title = `${societyName} Society Management` `` (same redundancy rule as above)

### 1.2 Landing page copy (`frontend/shell/src/pages/Landing.tsx`)
- [x] `:486` footer — → "© {year} {name} · {city} · Society Management Portal" (this is a thin bar rendered by Landing.tsx itself, stacked directly above the separate live `components/Footer.tsx` — easy to miss in a quick look, verified live via headless-browser screenshot)
- [x] `:326` features-grid subhead — "Built specifically for housing society event management" → "Built specifically for housing society management — from browsing events to entry" (not in original plan list, found via grep; live, umbrella-level copy)
- [x] Hero/feature card copy — `'Browse Events'`, `'Events per year'`, `'Discover Events'`, `'Events for every resident'` left as-is (module-level copy, per Task 0 hierarchy decision)
- [x] Icons — `EmojiEventsIcon`, `EventIcon` kept as-is (Task 0 decision)
- [x] `frontend/shell/src/components/Footer.tsx:57` — "The official event platform for residents of {name}." → "The official society management platform for residents of {name}." (**not in original plan** — this is the actual live footer component App.tsx wraps Landing with; found via live browser verification, not a static grep)

### 1.3 Mobile login page (`frontend/shell/src/pages/MobileLogin.tsx`)
- [x] `:168` tagline — → "Resident Society Management Portal"
- [x] `:255` — → "GMGT" label (standalone tight-space badge, no adjacent tenant name, so short name used in full per Task 0)

### 1.4 Loading / transitional states
- [x] `frontend/shell/src/App.tsx:182` — → "Connecting to GMGT Society Management…" (standalone, no tenant name adjacent, so full app name used)
- [x] Grepped shell `src/` for stray "Event Management"/"Society Events" copy — none left; `MfeUnavailable` labels ("Event Manager", "Events", "Booking", etc.) are module names, left as-is

---

## Task 2 — Standalone dev titles for each MFE (low visibility, low risk, do anytime)

- [x] `frontend/mfe-events/index.html` — title already module-scoped ("Events MFE — Standalone Dev"), no old umbrella brand string present, left as-is; added favicon
- [x] `frontend/mfe-booking/index.html` — same, added favicon
- [x] `frontend/mfe-payment/index.html` — same, added favicon
- [x] `frontend/mfe-admin/index.html` — same, added favicon
- [x] `frontend/mfe-tickets/index.html` — same, added favicon

---

## Task 3 — Visual identity

- [x] Favicon: shell already had a 🏛 emoji favicon from before this plan was written (plan's "none exists" note was stale) — reused the same emoji favicon on the 4 MFE dev pages that lacked one, for consistency
- [ ] Apply any theme/color palette changes — deferred, out of scope this session
- [ ] Add a logo — deferred, out of scope this session

---

## Task 4 — Verify nothing broke (repeat after each task above)

- [x] `tsc && vite build` passes for shell (only shell source was touched; MFE changes were static `index.html` only, no build risk)
- [x] Ran shell dev server standalone + drove it with a headless-browser (Playwright, ad hoc — no chromium-cli/browser preinstalled in this box) against `/` and `/mobile-login`; confirmed tab titles, footer copy, and the mobile-login tagline/label render correctly with no console errors. Screenshots taken.
- [x] Full docker stack found already running (`make ps`) — checked the shell as bundled behind nginx at `http://localhost:8080`: title tag confirmed updated (`GM Global Techies Town Society Management`), and `docker exec`'d into `society_frontend`'s built JS bundle to confirm "Connecting to GMGT Society Management…" and "Society Management Portal" are present in the deployed artifact, not just the dev server
- [x] Grepped the built, deployed asset bundle inside all 5 MFE containers (`society_mfe_events/booking/payment/admin/tickets`) for `event platform|Society Events|event management|Events Portal` — zero matches in any
- [x] `Nav.tsx` and the rest of `components/` grepped clean too — the only shared chrome across logged-in *and* logged-out routes (`Nav`, `Footer`) has no residual old-brand copy, and `Nav` only ever prints the dynamic tenant `name`/`shortName`, never a hardcoded app-brand string
- [ ] Did not click through actual logged-in admin/booking/payment/tickets pages with a real Keycloak session (would need a login against the external `~/auth-service` Keycloak) — lower priority now since the built-asset grep above is a stronger, exhaustive check for stray text than a manual click-through would be for this kind of copy-only change

---

## Task 5 — Optional: surfaces outside `frontend/` that still leak the old brand

Explicitly **out of frontend-only scope** — only do these if the rebrand is later extended
beyond the frontend. Listed here so the rebrand doesn't feel inconsistent once shipped.

- [ ] pgAdmin login banner — `PGADMIN_CONFIG_LOGIN_BANNER` in `docker-compose.yml` — "Society Events — DB Admin"
- [ ] Keycloak realm display name/theme in `~/auth-service` (separate repo) — the actual first screen a user sees on login, before this app even loads

---

## Parking lot — later architecture work, not part of this rebrand

Tracked here for continuity, not to be started until the frontend rebrand above is done.
See conversation history / memory (`project_society_rebrand_plan`) for full context.

- [ ] Split backend services into separate containers, one at a time, incrementally
- [ ] Use Postgres schema-per-service (same DB instance) — not separate DB instances — to keep ID-based SQL joins working across services
- [ ] `payment_transaction.event_id` is a hard, non-nullable FK to `event` — needs generalizing (nullable + polymorphic `payable_type`/`payable_id`, or similar) before payment-service can be reused for non-event billing like utilities
- [ ] Two payment-reconciliation implementations exist (`services/payment/app/reconciliation` in this repo, and the fully separate sibling project `~/payment_reconcilation_service`) — consolidate to one before splitting reconciliation into its own service
- [ ] New: Visitor Management service
- [ ] New: Utility Billing service (electricity/gas/water)
- [ ] New: CCTV Camera service — different data tier (video storage, not Postgres; likely event-bus rather than direct DB writes)

---

## Progress Log

Add one line per session: date, what was completed, what's next.

- 2026-07-10 — Plan created. Nothing started yet. Next: Task 0 decisions.
- 2026-07-10 — Task 0 decided (name "GMGT Society Management", short "GMGT", favicon reuse existing 🏛, icons unchanged). Tasks 1–3 done: shell titles/copy, MFE dev-title review + favicons. `tsc && vite build` passes for shell. Live-verified `/` and `/mobile-login` with a headless browser — caught two things the plan missed: `components/Footer.tsx` (the real footer, separate from `Landing.tsx`'s own footer strip — both are live, stacked) still said "official event platform," and a features-grid subhead said "housing society event management." Both fixed. Next: live browser click-through of the other 4 MFEs + logged-in routes (needs `make up` backend running), then nginx-bundled check (Task 4 remaining), and Task 5 whenever convenient.
