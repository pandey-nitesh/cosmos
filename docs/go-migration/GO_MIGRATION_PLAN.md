# OpenC3 COSMOS → Go Migration Plan

> Status: analysis & proposal. This document maps the current COSMOS architecture,
> proposes a **strangler-fig** migration of the backend compute/IO path to Go, and
> weighs the benefits and risks. Companion Excalidraw diagrams live alongside this
> file (`*.excalidraw.json`).

## TL;DR Recommendation

Do a **targeted, incremental** migration of the backend compute and I/O path to Go —
**not a full rewrite**.

- **Port to Go:** the C-extension compute core (binary marshalling, CRC, conversions,
  config tokenizer), the packet/structure layer, the interface & decom microservices,
  the operator/supervisor, and eventually the `cmd-tlm-api` REST surface.
- **Keep forever:** the Vue/Vuetify SPA, AnyCable gateways, Traefik, Valkey, versitygw
  (S3), QuestDB, and the **Ruby/Python script-execution + line-instrumentation** harness.
- **Retire over time:** the Python parallel core library (~46k LOC) — Go becomes the
  single non-Ruby runtime, collapsing three implementations of the same packet logic
  into two.

The migration works because every ported Go service speaks the **identical Valkey
topic schemas, `db_shard` routing, Redis hash/CVT layout, config DSL, plugin gem
format, and REST/WS contracts** — so Go and Ruby services interoperate on the same bus
and can be cut over one target at a time, with trivial rollback.

---

## 1. System overview (what we're migrating)

OpenC3 COSMOS is an open-source command & control system for embedded/spacecraft
systems. At runtime it is a set of cooperating containers wired together by **Valkey
(Redis)** and a **Traefik** reverse proxy.

| Layer | Component | Language | ~LOC | Migration verdict |
|---|---|---|---|---|
| Frontend | Vue 3 + Vuetify SPA (SystemJS micro-frontends) | JS/Vue | ~75k | **Keep as-is** |
| API | `cmd-tlm-api` (Rails 7.2, `:2901`) | Ruby/Rails | ~20.5k | Port REST (Phase 3) |
| API | `script-runner-api` (Rails 7.2, `:2902`) | Ruby/Rails | ~3.7k | Port REST front; keep execution |
| Core | Ruby core library | Ruby | ~60k | Port (Phases 1–3) |
| Core | C extensions | C | ~4.2k | **Port first (Phase 1)** |
| Core | Python parallel library | Python | ~46k | **Retire over time** |
| Infra | Operator / microservices | Ruby | ~6.5k | Port (Phases 2–3) |
| Infra | Traefik, Valkey, versitygw S3, QuestDB, AnyCable | — | — | **Keep as-is** |

### Runtime topology

Traefik (`:2900`) fronts everything and routes `/openc3-api/*` → `cmd-tlm-api` and its
AnyCable WS gateway (`:3901`), `/script-api/*` → `script-runner-api` and its WS gateway
(`:3902`), `/tools/*` → the versitygw S3 bucket (`:9000`), and serves the Vue SPA +
SystemJS tool bundles.

The `openc3-operator` process supervises a fleet of microservice child processes
(`InterfaceMicroservice`, `DecomMicroservice`, log/cleanup/router/plugin microservices)
it discovers from `MicroserviceModel` records in Redis. Each `InterfaceMicroservice`
owns one physical transport (TCP/UDP/serial/MQTT/HTTP) and bridges it to Valkey Streams.

**All** inter-service data flow is through Valkey Streams (`telemetry_topic`,
`command_topic`, decom topics, `interface_topic`, system events) plus Redis hashes
(models, CVT) and S3 buckets (target archives, plugin gems, logs, XTCE). QuestDB ingests
telemetry for time-series queries.

> See **Diagram 1 — Current Architecture**.

### Key end-to-end data flows

1. **Telemetry ingest:** transport → `Stream` → protocol chain (length/CRC/burst framing)
   → `Interface.read` → packet identification (`id_value_hash` reverse lookup) →
   `Topic.write_topic(telemetry_topic__SCOPE__TARGET)` → `DecomMicroservice` reads items
   via `binary_accessor` + applies conversions/processors → updates CVT (Redis hash) +
   publishes decom topics + logs raw/decom to S3 + ingests to QuestDB.
2. **Command send:** UI/script → REST `cmd()` on `cmd-tlm-api` → `build_cmd` (write
   conversions + validation) → `Topic.write_topic(command_topic__SCOPE__TARGET)` →
   `InterfaceMicroservice` (blocking `XREAD`) → target enable/disable check → write
   protocol chain → `Stream.write` → ack back to `interface_topic`.
3. **Script run:** frontend → `script-runner-api` REST spawn → `ChildProcess` forks
   Ruby/Python `run_script` → line-by-line instrumentation callbacks → stdout/stderr
   (50KB cap) + structured events → mirrored into `running-script-channel:<id>:replay`
   Redis stream → AnyCable WS pushes live events; control (go/pause/step/stop/prompt)
   flows back over pub/sub.
4. **Real-time UI streaming:** SPA opens AnyCable WS → subscribes to
   streaming/limits/config/timeline channels → backend tails decom/limits streams and
   pushes JSON deltas → widgets (uPlot, gauges, limits bars) render.

---

## 2. The contracts that must stay immutable

The migration's safety depends on Go services preserving these byte-for-byte. **Treat
them as frozen** for the duration of the migration:

1. **Valkey Stream topic schemas & naming:** `command_topic__SCOPE__TARGET`,
   `telemetry_topic__SCOPE__TARGET`, decom topics, `interface_topic`,
   `limits_event_topic`, `config_topic`, `OPENC3__SYSTEM__EVENTS`. Message hashes carry
   `target_name`/`packet_name`/`time`/`buffer`/`received_count` fields that Go
   producers/consumers must emit/parse identically.
2. **`db_shard` routing:** `Store.db_shard_for_target()` (60s TTL cache) decides which
   Redis logical shard a target's topics live on. Go must use the same sharding function.
3. **Redis hash / model layout:** `openc3_targets`, `openc3_interfaces`,
   `openc3_microservices`, and the **Current Value Table (CVT)** keyed per
   scope/target/packet/item. JSON serialization shape must match so Ruby and Go read each
   other's models.
4. **Stream consumer-group / offset semantics:** `Topic.read_topics` offset tracking,
   blocking `XREAD`, and the running-script replay stream (cap 1000, TTL).
5. **Config DSL:** text keywords (`PACKET`, `ITEM`, `CONVERSION`, `LIMITS`, `STATE`, …)
   with ERB templating, plus XTCE XML — a Go parser must accept the exact grammar and
   produce equivalent packet templates.
6. **Plugin gem packaging format:** plugins are Ruby gems containing targets/tools/
   interfaces; the gem layout, `plugin.txt` manifest, and target archive ZIP format are a
   hard contract for third-party plugin authors.
7. **Binary packet wire semantics:** bit offset/size, endianness, signed/unsigned,
   overflow handling, and buffer-copy vs in-place mutation defined by
   `Structure`/`binary_accessor` and `structure.c`. Go marshalling must be bit-for-bit
   identical.
8. **HTTP REST + AnyCable WS contracts:** `/openc3-api/*` and `/script-api/*` JSON
   shapes and channel names consumed by the SPA.

---

## 3. Component → Go mapping

| Component | Go target | Key Go libs | Difficulty | Phase |
|---|---|---|---|---|
| C extensions (structure/crc/burst/poly/config) | Pure-Go marshalling: bit math, CRC tables, byte-loop sync, Horner conv, bufio tokenizer | `encoding/binary`, `math/bits`, `hash/crc32`, `hash/crc64`, `bufio`, `sync.Pool` | low | 1 |
| Packet/Structure core (`packet.rb`, `binary_accessor.rb`) | Go `Packet`/`Structure` types + reverse index for LATEST/item→packet; atomic counters | `sync/atomic`, `encoding/binary`, `math/bits`, `sync.Pool` | high | 1 |
| Redis/Valkey Streams + `db_shard` + EphemeralStore | Go `Store`/`Topic` wrapper (write/read topics, offsets, shard cache, pool) | `github.com/redis/go-redis/v9` | medium | 1 |
| Config parsing (text DSL + ERB + XTCE) | Recursive-descent parser → JSON templates; XML decoder; `text/template` for ERB | `encoding/xml`, `text/template`, custom lexer | high | 2 |
| Conversions & processors | Native Go for built-ins; pluggable Lua/sidecar for user Ruby/Python | `gopher-lua` or `os/exec` sidecar | medium | 2 |
| `InterfaceMicroservice` | Per-interface goroutine group; `io.ReadWriter` streams; protocol middleware; `context` connect/disconnect | `net`, `go-redis`, `errgroup`, `context` | high | 2 |
| Streams (TCP/UDP/serial/MQTT/HTTP/WS) | `io.ReadWriteCloser` per transport | `net`, `go.bug.st/serial`, `paho.mqtt.golang`, `gorilla/websocket` | medium | 2 |
| Protocol chain (length/CRC/terminated/burst/COBS/preid/template) | Composable Reader/Writer middleware with STOP semantics | `bytes`, custom interfaces | medium | 2 |
| `DecomMicroservice` | Go decom worker → decom topics + CVT + bucket logs + QuestDB | `go-redis`, `aws-sdk-go-v2`, questdb client | high | 2 |
| Models (`TargetModel`, `InterfaceModel`, `MicroserviceModel`, ~40 files) | Go structs with JSON matching Redis hash layout | `encoding/json`, `go-redis` | medium | 2 |
| S3/bucket access | Go S3 client vs versitygw | `aws-sdk-go-v2/s3` or `minio-go` | low | 2 |
| `MicroserviceOperator`/`OperatorProcess` | Go supervisor: `os/exec` + bounded start rate + Redis watch loop | `os/exec`, `context`, `go-redis`, `log/slog` | medium | 3 |
| `cmd-tlm-api` REST | Go HTTP service replicating JSON contracts behind same routes | `net/http` or `gin`/`echo`, `go-redis` | high | 3 |
| `script-runner-api` REST front | Optional Go REST; **bridges to Ruby/Python execution** | `net/http`, `go-redis`, `os/exec` | medium | 3 |
| **Script instrumentation + execution** | **KEEP Ruby/Python** — Go cannot instrument Ruby/Python line-by-line | `os/exec` bridge only | very-high | keep-as-is |
| Python parallel core library | **Retire** — not reimplemented separately in Go | n/a | high | keep-as-is |
| Vue/Vuetify SPA, AnyCable, Traefik/Valkey/versitygw/QuestDB | **Keep as-is** (Go serves static bundles, publishes via AnyCable HTTP broadcaster) | `net/http` | low | keep-as-is |

> See **Diagram 2 — Target Architecture (Go strangler-fig)**.

---

## 4. Phased plan

> See **Diagram 3 — Migration Roadmap**.

### Phase 0 — Foundations & test harness
**Goal:** establish the Go shared library and a golden-master test corpus *before*
touching any running service, so every later port is provably byte-compatible.
- Go module layout (`openc3-go-lib`).
- Redis/Valkey `Store` + `Topic` wrapper with `db_shard` parity.
- S3 + AnyCable broadcaster clients.
- Golden-master fixtures captured from Ruby (packet buffers, CRC vectors, topic
  messages, config→template JSON).
- **Strangler:** pure additive, no production traffic. A differential test rig replays
  recorded Ruby outputs through Go code and asserts equality.

### Phase 1 — Compute core (the C-extension win)
**Goal:** port the performance-critical, stateless, well-bounded compute primitives
(the strongest pro-Go signal) plus the Redis stream wrapper.
- `structure.c` / `binary_accessor` bit marshalling → Go.
- `crc.c` + polynomial/segmented conversions → Go.
- `burst_protocol` sync search; `config_parser` tokenizer → Go.
- `Packet`/`Structure` types with reverse index + atomic counters.
- **Strangler:** ship as a library validated by fuzzing + benchmarks vs the C extension.
  Optionally expose to Ruby via cgo/FFI as a drop-in accelerator so the existing system
  gains from the Go core *before any service is replaced*. No topic contract changes.

### Phase 2 — First Go microservice on the live bus
**Goal:** run one Go `InterfaceMicroservice` in production speaking the exact same Valkey
topics, alongside untouched Ruby `DecomMicroservice` and Ruby APIs.
- `InterfaceMicroservice` (goroutine group, state machine).
- Stream implementations (TCP/UDP/serial/MQTT/HTTP) + protocol chain middleware.
- Models (Interface/Microservice/Target) as Go structs.
- `DecomMicroservice` (second Go target) + S3 log writing + QuestDB ingest.
- **Strangler:** the operator already spawns arbitrary binaries via
  `MicroserviceModel`/`OperatorProcess` — point it at the Go binary for selected
  interfaces. **Per-interface cutover:** one target moves to Go while the rest stay Ruby.
  Roll back by flipping the microservice config. Because Go consumes/produces identical
  `command_topic`/`telemetry_topic` messages and CVT layout, Ruby decom/API never know
  the difference.

### Phase 3 — Operator and stateless REST APIs
**Goal:** replace the supervisor and the `cmd-tlm-api` REST surface once many
microservices are Go, shrinking the Ruby footprint to the script harness.
- `MicroserviceOperator` supervisor in Go.
- `cmd-tlm-api` REST (`cmd`/`tlm`/`get_cmd`/`get_tlm`/`tools`/`map.json`).
- Config parser (text DSL + XTCE) for plugin load.
- `script-runner-api` REST front (execution stays Ruby/Python).
- **Strangler:** run Go `cmd-tlm-api` behind Traefik on the same `/openc3-api/*` routes;
  mirror a subset of endpoints and shadow-test responses against Ruby before flipping
  routes endpoint-by-endpoint. Operator cutover is a single supervised swap with the
  Ruby operator kept as fallback. Script execution continues to shell out to the
  Ruby/Python `RunningScript` harness — never ported.

---

## 5. Benefits

1. **Eliminates the dual Ruby + C-extension maintenance burden.** `structure.c`/`crc.c`/
   etc. (~4.2k LOC of Ruby-1.8-era C with manual signal handling and FFI boundary
   crossing) collapse into native Go that is faster (estimated 2–5×, less boundary
   overhead, GC-friendly short-lived buffers) and far easier to maintain.
2. **Retires the Python parallel library** (~46k LOC + tests) as a separate runtime to
   keep in lockstep with Ruby — ending the chronic drift between three implementations of
   the same packet logic. Go becomes the single non-Ruby core runtime.
3. **Concurrency model fits the domain.** Each interface as a goroutine, protocol chains
   as middleware, `errgroup`-supervised microservices — replaces Ruby thread+mutex
   contention (`Structure`/`Packet` `@mutex` on every high-frequency read) with lighter
   primitives and atomic counters.
4. **Faster startup and lower memory per microservice** — meaningful when an operator
   supervises dozens/hundreds of interface and decom processes; directly helps the
   startup-stampede throttling and reconnect resource-exhaustion hotspots.
5. **Single static binary per microservice** simplifies container images and deployment
   vs the Ruby gem + native-extension build chain.
6. **Zero big-bang risk.** The shared Valkey/Redis/S3 contracts let Go validate in real
   production incrementally; each ported service is independently roll-back-able.

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Byte-level packet incompatibility** (mutable Ruby strings + buffer-copy vs in-place; unaligned bitfields, signed overflow, endianness) can silently diverge | Exhaustive golden-master + fuzz differential testing in Phases 0/1 *before* any cutover |
| **`db_shard` routing & Stream offset semantics** are subtle (60s TTL cache, blocking `XREAD`, offset tracking) — a mis-sharded Go service silently drops telemetry | Treat the `Store`/`Topic` wrapper as a contract-tested foundation; replay tests |
| **Custom user conversions/processors in Ruby/Python** cannot run natively in Go | Keep mixed-language interfaces on Ruby until usage is measured; Lua/sidecar bridge only where needed |
| **Script instrumentation is fundamentally Ruby/Python** (binding/eval line callbacks) | Do not port — keep in Ruby/Python permanently; Go only fronts the REST API |
| **Config DSL + ERB + XTCE parser** is a large correctness-critical surface | Parse-to-JSON differential tests against Ruby `PacketConfig` across all real plugins |
| **Two runtimes during migration** double operational surface | Unify structured logging/metrics (`slog` + OpenTelemetry) from day one |
| **Circular `System`/`Telemetry` init dependency** doesn't map to Go's init model | Deliberate dependency restructuring with regression tests |
| **Plugin gem / target archive format** is a public contract for third-party authors | Go services must keep consuming the gem/ZIP format exactly |

---

## 7. Effort summary

The Go core covers logic spanning ~80k LOC of source (60k Ruby core + 4.2k C +
~15–20k interfaces/operator), but only **~30–40k LOC needs first-class porting** — the
SPA (~75k, kept), the Python parallel lib (~46k, retired not ported), and script
instrumentation (~5k, kept in Ruby) are out of scope.

| Phase | Effort | Note |
|---|---|---|
| Phase 0 + Phase 1 | ~2–3 person-months | Dominated by differential-test rigor, not code volume |
| Phase 2 | ~3–4 person-months | Includes production cutover tooling |
| Phase 3 | ~4–6 person-months | After this the Ruby footprint is small |
| **Total** | **~9–15 months** | Incremental; value delivered at the end of each phase; rollback available at every step |

**Highest-ROI, lowest-risk slice:** Phase 1's C-extension replacement, which can ship as
an FFI-accelerated library improvement even if the broader migration stalls.

---

*Generated from a multi-agent architecture analysis of the COSMOS repository. The
companion Excalidraw diagrams (current architecture, target architecture, roadmap) are
stored next to this file.*
