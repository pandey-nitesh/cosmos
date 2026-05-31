# PM Feedback Log

This file records each round of the Product Manager ↔ build feedback loop.
Round 1 reviewed the plan (pre-build); Round 2 reviewed the built artifact.

---

## Round 1 — Pre-build plan review

**Reviewer:** Product Manager agent · **Verdict:** Strong wedge, sound architecture. Approve to build **after** MUST-FIX items. Biggest gap: the plan was engineered around a *data model and cron job* rather than the *60-second value moment*.

### Key findings
- **Reframe around the value moment:** the centerpiece is a **city-by-city eligibility grid** (green/yellow/red with the specific blocker/next-expiry inline). The dashboard was scheduled last and "minimal" — that is backwards. The grid *is* the product.
- **Boolean → actionable:** `eligibleToBid` alone is useless; must return the *fix path* ("need Class B license + GL is $500K, Aurora requires $1M").
- **Data model is too flat:** assumes one contractor = one license holder. Real trades = a **business** qualified by a **person/qualifier** who holds the license. Add that layer.
- **Document linkage missing:** credentials need an `r2_key`/`uploaded_at` so a COI/license carries its proof PDF.
- **Insurance too coarse:** split per-occurrence vs aggregate, add workers' comp + additional-insured.
- **License classes, not booleans:** model "to bid trade X here you need class ∈ {…}".
- **Trust = the moat:** every jurisdiction rule needs `source_url` + `verified_on`, surfaced with a disclaimer (stale rules are dangerous).
- **DX is make-or-break:** one-command seeded local run, no Cloudflare account, dashboard opens on a story-driven, fully-populated demo business.
- **Cut/stub:** permits (table only), R2 upload UX (wire it, don't feature it).
- **Metrics:** activation (got past data-entry wall), lapses-prevented (alert→renewal), eligibility-grid engagement.

### MUST-FIX-BEFORE-BUILD punch-list (all incorporated into plan v2)
1. Eligibility grid dashboard built early, as the centerpiece.
2. `evaluateCompliance` returns actionable blockers (missing class, exact GL shortfall, next-expiry date).
3. Business/qualifier layer (`businesses` ↔ `people` ↔ `licenses`).
4. Document linkage (`r2_key` + `uploaded_at`) on licenses & insurance.
5. Insurance: per-occurrence/aggregate limits + workers' comp + additional-insured.
6. Required license classes per jurisdiction+trade (not a boolean).
7. `source_url` + `verified_on` on every jurisdiction rule + UI disclaimer.
8. One-command setup: migrate + seed + local run, no Cloudflare account.
9. Story-driven seed businesses; dashboard opens fully populated.
10. `grace_period_days` for honest near-expiry eligibility.

### NICE-TO-HAVE (incorporated where cheap)
11. Reciprocity (`accepts_license_from`) structure. ✅ added
12. README screenshot of the grid above the fold. ✅ SVG mockup added
13. "Run alert scan now" button surfacing `POST /api/scan`. ✅ added
14. Permits stubbed (table only). ✅
15. Jurisdiction-agnostic schema. ✅

> Full round-1 transcript preserved in repo history. Resolution of each item is tracked in `05-build-vs-feedback.md`.

---

## Round 2 — Built-artifact review

**Reviewer:** Product Manager agent · **Decision:** **APPROVE WITH NITS** — ship as the reference repo.

**MUST-FIX verification: 10/10 RESOLVED** (each confirmed against actual code, not just the claims doc). `npm test` → 12/12 passing. The 60-second value moment lands: a stranger immediately sees the color-coded "Eligible to bid?" grid with specific blockers + remedies, switchable across four story businesses.

### Issues the PM found in the build
1. **`upcoming[]` rollup computed but never rendered** — a *blocked* city could hide an imminent expiry from the headline counts. (Top priority; data already in the response.)
2. **Scan is global but presented per-business** — needs a caption clarifying it scans all businesses like the cron.
3. **Warning-level alerts had no dedup** — daily cron would re-alert for weeks (latent spam bug).
4. Reciprocity applies the accepting city's grace to the issuing license (minor logic smell).
5. Qualifier layer is modeled/seeded but not yet load-bearing in the engine (decorative for MVP).
6. KV cache shown for its own sake; UI doesn't consume it.

### Iteration applied this round (loop closed, not just logged)
- ✅ **#1** Dashboard now renders a "What lapses next" rollup across all cities (`public/index.html`) — verified it surfaces the Front Range Mechanical COI even on a partly-blocked business.
- ✅ **#2** Added a caption under the grid: *"The alert scan runs across all businesses (exactly as the daily Cloudflare Cron does)."*
- ✅ **#3** Queue consumer is now **idempotent** — skips a same-entity/same-severity alert within 20h (`src/index.ts`). Verified: scanning twice keeps the `alerts` count at 2, not 4.
- Items #4–#6 accepted as documented roadmap (below).

### Top-3 next-iteration roadmap (post-reference-MVP)
1. Make alerts **escalating** (only re-notify on severity escalation), building on the new idempotency guard.
2. **Activate the qualifier layer in logic** — tie eligibility/alerts to a specific person's credential.
3. Use the issuing jurisdiction's grace period in the reciprocity path; add KV cache invalidation on rule change.

> Outcome: two rounds of PM feedback, both acted on. The build is honest about its limits and matches its claims doc.
