# Research Synthesis — Denver/Colorado Business Pain Points

> Compiled by the **Orchestrator** from four parallel research agents (A–D), each
> covering a different sector of the Denver metro economy. Every agent used live
> web search and scored each pain point on scale, software-solvability, and
> Cloudflare-fit. Full agent briefs are summarized below with sources.

## Method

Four research agents fanned out across distinct sectors:

| Agent | Sector |
|-------|--------|
| A | Restaurants, food service, hospitality, breweries, tourism |
| B | Construction, contractors, home services, skilled trades |
| C | Small healthcare & wellness practices (dental, PT, therapy, vet, med spa) |
| D | Local retail, professional services, real estate/property mgmt, fitness, salons, small B2B |

Each pain point was scored 1–5 on **software-solvability** and **Cloudflare-fit**
(can it be built on Workers / D1 / KV / R2 / Durable Objects / Queues / Cron
without GPUs, heavy compute, or on-prem hardware?).

## The convergent signal

Two independent agents (A — restaurants, D — retail/services) **independently
surfaced the same root problem from opposite ends of the economy**: Colorado's
**fragmented, self-administered jurisdiction landscape** makes *compliance* a
recurring, high-stakes, manual chore for small businesses.

- **Agent A** → multi-jurisdiction **wage & tip-credit** patchwork (Denver $19.29,
  Edgewater, Boulder + HB25-1208 letting localities set tipped wages independently).
- **Agent D** → Colorado **home-rule sales tax**: ~70 self-collecting cities, only
  ~40 in the state SUTS portal; Denver/Boulder/Aurora must be filed directly.
- **Agent B** → Colorado has **no statewide GC license**; every municipality runs
  its own exam, fees, and renewal cycle with almost no reciprocity.

That is the same disease in three organs: **Colorado devolves
regulation to dozens of municipalities, and small businesses must independently
track, renew, and prove compliance in each one** — with penalties for every
missed deadline. It is acute in Colorado and **generalizes to every home-rule /
municipal-licensing jurisdiction nationally** (AK, AL, LA for tax; TX/FL/West for
licensing; CA/WA/NY/MN for local wages).

## Top candidate per agent

| # | Candidate | Scale | SW-solve | CF-fit | Incumbent gap | Regulatory/build risk |
|---|-----------|:----:|:-------:|:------:|---------------|-----------------------|
| A | Multi-jurisdiction wage/tip-credit compliance engine | High | 4 | **5** | Payroll suites treat it as a checkbox | Needs payroll integration |
| B | **Multi-jurisdiction contractor license + COI + permit tracker** | High | **5** | **5** | COI trackers face GCs, not contractors; nobody owns the jurisdiction-rules DB | **Low** — no money movement, no PHI |
| C | Missed-call recovery + reminders for micro-practices | High | 4 | 4 | Incumbents over-bundle at $329–399/mo | PHI/BAA friction on Cloudflare |
| D | Colorado home-rule sales tax filing autopilot | **Very High** | 5 | **5** | Avalara enterprise-priced; TaxJar SUTS-dependent | **High** — money movement, no city filing APIs, audit liability |

Sources (selected): Holland & Knight & Littler on CO local wages; Denver.gov 2026
minimum wage; Procore & Contractor Licensing Inc on CO municipal GC licensing;
TaxJar/Stripe/Numeral on CO home-rule sales tax; MGMA/Tebra on practice no-shows;
Cloudflare/AccountableHQ on HIPAA BAA limits. (Per-claim URLs retained in agent
transcripts.)

## Why not the highest-"scale" option (D, sales tax)

Sales-tax filing has the largest TAM, but it is the **worst fit for a credible,
demonstrable reference build**:

- It requires **moving money** and **filing to government portals that have no
  public APIs** (Denver et al.) — meaning RPA/manual ops, not pure software.
- It carries **audit and fiduciary liability** out of proportion to an MVP.
- Incumbents (Avalara, TaxJar) are deeply entrenched on exactly this workflow.

An honest demo of "we file your Denver return" is impossible without those
integrations. We keep the home-rule *thesis* but pick the wedge we can actually
ship and demo end-to-end.

→ See `02-decision-record.md` for the selection.
