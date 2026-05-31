# ADR-001 — Selected Solution

**Status:** Accepted (orchestrator decision, reviewed by Product Manager agent — see `03-pm-feedback-log.md`)

## Decision

Build **Frontline** — a **multi-jurisdiction compliance command center for Front
Range trades contractors**. It maintains a structured database of *what each
municipality requires* (license class, exam, fees, insurance minimums) and tracks
every credential a contractor holds — **licenses, insurance certificates (COIs),
and permits** — with proactive renewal/lapse alerts.

> One screen that answers: *"Am I legal to bid in Aurora today, and what lapses
> in the next 30 days across every city I work in?"*

## Why this wedge (vs. the other three finalists)

It uniquely maximizes the product of all four axes **and** is the only finalist
we can ship and demonstrate honestly as a reference build:

- **Scale (High):** tens of thousands of Front Range contractors; generalizes to
  every home-rule/municipal-licensing state.
- **Software-solvability (5/5):** pure data + workflow + scheduled reminders.
- **Cloudflare-fit (5/5):** maps 1:1 onto Cloudflare primitives (see below) — no
  GPUs, no heavy compute, no on-prem.
- **Underserved (clear gap):** existing COI trackers face *GCs tracking their
  subs*; generic license trackers do dumb expiry reminders. **Nobody owns the
  contractor-facing jurisdiction-rules database** for fragmented states.
- **Low regulatory/build risk:** no money movement (unlike sales tax), no PHI
  (unlike healthcare), no payroll integration dependency (unlike wage engine).

## The broader thesis (why this is a platform, not a feature)

The same engine — *a jurisdiction-rules database + a per-deadline state machine +
proactive alerts* — is the substrate under all three convergent pains. Licensing
is the **beachhead**; the roadmap extends the same primitives to local wage rules
(Agent A) and home-rule tax deadlines (Agent D).

## How it maps onto Cloudflare

| Capability | Cloudflare primitive |
|------------|----------------------|
| API / routing | **Workers** (Hono) |
| Relational data (contractors, jurisdictions, licenses, COIs, deadlines) | **D1** (SQLite) |
| Document storage (license & COI PDFs) | **R2** |
| Cached jurisdiction-rules lookups | **KV** |
| Daily deadline scan | **Cron Triggers** (scheduled Worker) |
| Alert fan-out (email/SMS) | **Queues** + consumer Worker |
| Static dashboard | **Workers Assets / Pages** |

## Out of scope for the reference MVP

- Real payment processing / money movement.
- Direct e-filing to government portals (no public APIs exist).
- Storing PHI or any regulated health data.
- Production email/SMS delivery (the MVP stubs the provider behind an interface).
