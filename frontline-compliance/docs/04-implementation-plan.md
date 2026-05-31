# Implementation Plan — Frontline (v1, pre-PM-review)

## Goal

A runnable, fully-typed Cloudflare reference application demonstrating the
multi-jurisdiction compliance command center, with seeded real Front Range
jurisdiction data, an alerting cron job, a queue consumer, tests, and a minimal
dashboard.

## Tech stack

- **Runtime:** Cloudflare Workers, TypeScript (ES modules)
- **HTTP:** Hono (lightweight, Workers-native router)
- **DB:** D1 (SQLite) with SQL migrations + seed
- **Docs storage:** R2 (presigned upload/download for license & COI PDFs)
- **Cache:** KV (jurisdiction-rules lookups)
- **Scheduling:** Cron Triggers → daily deadline scan
- **Async:** Queues → notification fan-out, with a consumer + pluggable `Notifier`
- **Frontend:** single static dashboard (`public/`) served via Workers Assets, calls the JSON API
- **Tests:** Vitest + `@cloudflare/vitest-pool-workers`

## Data model (D1)

- `jurisdictions` — id, name, state, license_required, license_authority, exam_required, renewal_period_months, min_general_liability, notes
- `contractors` — id, business_name, email, phone, trade
- `licenses` — id, contractor_id, jurisdiction_id, license_number, classification, issued_on, expires_on, status
- `insurance_policies` (COIs) — id, contractor_id, carrier, policy_number, coverage_type, coverage_limit, expires_on
- `permits` — id, contractor_id, jurisdiction_id, permit_number, type, status, expires_on
- `alerts` — id, contractor_id, entity_type, entity_id, due_on, severity, channel, sent_at

## API surface (Hono)

- `GET  /api/health`
- `GET  /api/jurisdictions` / `GET /api/jurisdictions/:id`
- `POST /api/contractors` / `GET /api/contractors/:id`
- `GET  /api/contractors/:id/compliance` — the money endpoint: per-jurisdiction
  "eligible to bid?" + everything expiring within N days
- CRUD for `licenses`, `insurance_policies`, `permits`
- `POST /api/documents/upload-url` — R2 presigned upload
- `POST /api/scan` — manually trigger the deadline scan (same code path as cron)

## Scheduled + queue flow

1. Cron (daily) → `scanDeadlines()` finds licenses/COIs/permits expiring within
   thresholds (e.g. 60/30/7 days) and overdue items.
2. Each finding is enqueued to a Queue.
3. Queue consumer writes an `alerts` row and calls `Notifier.send()` (stubbed
   `ConsoleNotifier` in MVP, swappable for Resend/Twilio).

## Compliance engine (the core IP)

`evaluateCompliance(contractor, jurisdiction, licenses, policies)` returns:
- `eligibleToBid: boolean`
- `blockers: []` (no current license, lapsed license, insufficient GL limit)
- `upcoming: []` (everything expiring within the warning window)

## Seed data

Real, sourced Front Range jurisdiction rules: Denver, Aurora, Lakewood, Boulder,
Colorado Springs, plus the State of Colorado baseline (no statewide GC license).

## Deliverables

1. `wrangler.jsonc` wiring D1, KV, R2, Queues, Cron, Assets.
2. `src/` — Worker entry, routes, compliance engine, scan job, queue consumer, db helpers, types.
3. `migrations/` — schema + seed.
4. `public/` — dashboard.
5. `test/` — compliance-engine unit tests + API integration tests.
6. `README.md` — run/deploy instructions.

## Milestones

- M1: schema + seed + types + db helpers
- M2: compliance engine + tests (TDD the core)
- M3: API routes
- M4: cron scan + queue consumer + notifier
- M5: dashboard
- M6: README + deploy notes
