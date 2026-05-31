# Build vs. PM Feedback — Resolution Matrix

How each Round-1 MUST-FIX / NICE-TO-HAVE was addressed in the build. Verified
end-to-end against a live `wrangler dev` instance (local D1/KV/R2/Queues).

## MUST-FIX-BEFORE-BUILD

| # | Item | Resolution | Evidence |
|---|------|-----------|----------|
| 1 | Eligibility grid is the centerpiece, built early | Dashboard (`public/index.html`) is the colored city grid; `GET /api/businesses/:id/compliance` is the primary endpoint | Grid renders 4 demo businesses on load |
| 2 | Actionable blockers, not a boolean | `Blocker { code, detail, remedy }` with exact gaps ("$500,000" vs required "$1,000,000") | `INSUFFICIENT_GL_*` tests assert the dollar figures |
| 3 | Business → qualifier → license layer | `businesses` ↔ `people` ↔ `licenses` tables; licenses held by a person, credited to a business | `migrations/0001_schema.sql` |
| 4 | Document linkage | `r2_key` + `uploaded_at` on `licenses` & `insurance_policies`; `PUT /api/documents/...` sets them | Verified upload → record linkage → retrieval |
| 5 | Granular insurance | per-occurrence / aggregate split + workers' comp + additional-insured, all checked by the engine | `NO_ADDITIONAL_INSURED`, `NO_WORKERS_COMP` tests |
| 6 | License classes per jurisdiction+trade | `jurisdiction_requirements.required_classes` (JSON); engine does class-match | `WRONG_CLASS` test |
| 7 | `source_url` + `verified_on` + disclaimer | columns on `jurisdictions`, surfaced per grid cell + dashboard disclaimer | Visible on every card |
| 8 | One-command local setup, no CF account | `npm run db:migrate && npm run dev` (or `npm run demo`); fully local simulation | Ran clean from scratch |
| 9 | Story-driven seed; dashboard opens populated | 4 businesses: compliant/here-blocked-there, COI-lapsing, license-lapsed, reciprocity | All 4 validated via API |
| 10 | `grace_period_days` | column on `jurisdictions`; engine honors it | grace-period test (Boulder 30-day window) |

## NICE-TO-HAVE

| # | Item | Resolution |
|---|------|-----------|
| 11 | Reciprocity | `jurisdiction_reciprocity` table + engine path; Cornerstone bids Wheat Ridge on its Denver license | ✅ |
| 12 | Grid screenshot above the fold | `docs/grid-mockup.svg` embedded at top of README | ✅ |
| 13 | "Run alert scan now" button | dashboard button → `POST /api/scan`, prints enqueued alerts | ✅ |
| 14 | Permits stubbed | `permits` table only, no CRUD/UI | ✅ |
| 15 | Jurisdiction-agnostic schema | no Colorado-specific columns; backs the "generalizes nationally" claim | ✅ |

## Verification run (local)

- `npm test` → 12/12 passing (compliance engine).
- `npm run typecheck` → clean.
- Live API: all four demo stories return the expected grid statuses and blockers.
- `POST /api/scan` → 2 alerts enqueued → queue consumer persisted both to `alerts`
  and emitted `ConsoleNotifier` lines to the correct recipient emails.
- R2: PDF uploaded, `r2_key` linked to the record, fetched back intact.
- KV: `/api/jurisdictions` served from cache on repeat calls.
