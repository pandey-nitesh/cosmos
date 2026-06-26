# Go Migration — documentation set

This folder documents a proposed migration of the OpenC3 COSMOS backend to Go.

- **[GO_MIGRATION_PLAN.md](./GO_MIGRATION_PLAN.md)** — full analysis, component→Go
  mapping, phased plan, benefits, risks, and effort estimate.
- **`*.excalidraw.json`** — diagram sources (Excalidraw element skeletons). Paste the
  array into an Excalidraw canvas / MCP renderer to view or edit.

## Diagrams

1. **`01-current-architecture.excalidraw.json`** — the as-is runtime: Vue SPA → Traefik
   → Rails APIs, the Valkey Streams bus, the operator and its microservices, S3/QuestDB,
   and external targets.
2. **`02-target-architecture.excalidraw.json`** — the strangler-fig end state: Go
   services and remaining Ruby/Python services sharing one immutable Valkey bus, fed by a
   shared `openc3-go-lib`.
3. **`03-migration-roadmap.excalidraw.json`** — Phases 0–3 with per-phase scope, effort,
   what is kept, and what is retired.

> Note: these JSON files use the compact Excalidraw "skeleton" format (auto-bound arrows,
> labeled shapes). Most Excalidraw tooling will expand them into a full scene on import.
