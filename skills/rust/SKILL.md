---
name: rust
description: Router for the Rust and WebAssembly skills — which one to use and when.
disable-model-invocation: true
---

# Rust & WebAssembly — skill router

Type `/rust` to see this index. Pick exactly one skill per job; they chain where noted.
`rust-skills` is the rule bank (269 rules across 26 categories); the other skills cite into it
instead of repeating it.

## Core — daily use

| I want to… | Use |
|---|---|
| Start any Rust task; the senior-engineer workflow | `rust-skill` |
| Fix ownership, borrow or lifetime errors | `rust-ownership` |
| Mutate through `&self`; `Cell` / `RefCell` / `Mutex` / atomics | `rust-mutability` |
| Threads, async/tokio, `Send`/`Sync`, channels | `rust-concurrency` |
| Design error types with `thiserror` / `anyhow` | `rust-error` |
| House style, naming, module layout, clippy config | `rust-coding` |
| An HTTP service with axum | `rust-web` |
| Look up one rule by ID (`own-`, `perf-`, `unsafe-`, …) | `rust-skills` |

## Advanced — deep understanding

| I want to… | Use |
|---|---|
| Audit `unsafe`, raw pointers, FFI for soundness | `rust-unsafe` |
| Remove clone abuse, unwrap abuse, stringly-typed APIs | `rust-anti-pattern` |
| Profile, benchmark, cut allocations, tune the release build | `rust-performance` |
| Track editions, MSRV, RFCs; plan a migration | `rust-learner` |
| Choose a crate or dependency, or drop one | `rust-ecosystem` |
| Redis caching: keys, TTL, invalidation, stampedes | `rust-cache` |
| JWT, API keys, password hashing, rotation | `rust-auth` |
| Tower layers: CORS, rate limits, timeouts, request IDs | `rust-middleware` |
| Actor-style state, mailboxes, supervision | `rust-actor` |
| Test strategy: unit, integration, proptest, mockall, loom, criterion | `rust-testing` |
| Database access: sqlx / diesel / sea-orm, pools, transactions, migrations | `rust-database` |
| Tracing spans, metrics, OpenTelemetry, log hygiene | `rust-observability` |
| Roles, ABAC, policy decisions, deny-overrides, XACML | `rust-xacml` |
| Algorithm or data-structure choice by constraint and cost | `rust-algorithms` |

## Expert — specialized

| I want to… | Use |
|---|---|
| C / C++ / Python interop: bindgen, cxx, PyO3, ABI | `rust-ffi` |
| `Pin`, `Unpin`, self-referential types | `rust-pin` |
| `macro_rules!`, derive, proc-macros, `syn`/`quote` | `rust-macro` |
| Streams, `select!`, backpressure, cancellation safety | `rust-async` |
| `'static` task topology, workers, graceful shutdown | `rust-async-pattern` |
| `const fn`, const generics, compile-time assertions | `rust-const` |
| Typestate, newtype, `PhantomData`, sealed traits | `rust-type-driven` |
| HRTB, GATs, variance, `'static` bounds | `rust-lifetime-complex` |
| Error taxonomy, retries, domain→transport mapping | `rust-error-advanced` |
| Monomorphization, dispatch choice, binary size, codegen checks | `rust-zero-cost` |
| RAII, `Drop`, leaks, guards, cleanup that can fail | `rust-resource` |
| Idempotency, retries, leases, outbox, consensus | `rust-distributed` |
| `no_std`, HAL traits, interrupts, `embassy`, `defmt` | `rust-embedded` |
| eBPF programs, XDP, maps, CO-RE, verifier limits | `rust-ebpf` |
| GPU compute, wgpu/CUDA, buffer layout, residency | `rust-gpu` |
| DPDK bursts, mempools, per-core datapaths | `rust-dpdk` |
| Must-consume APIs, affine vs linear semantics | `rust-linear-type` |
| Generators, suspend/resume, green threads | `rust-coroutine` |

## WebAssembly

| I want to… | Use |
|---|---|
| Compile Rust to wasm; wasm-bindgen / wasm-pack / trunk | `rust-wasm` |
| Shrink or speed up a wasm binary | `rust-wasm-performance` |
| Full wasm audit before shipping | `rust-wasm-audit` |
| Move values across the JS ↔ wasm boundary | `rust-wasm-js-interop` |

## Problem-based lookup

### Compilation errors

| Symptom | Skill |
|---|---|
| `E0382`, `E0506`, `E0515` — moved value, assign while borrowed, reference to a local | `rust-ownership` |
| `E0502`, `E0507` — borrow conflict, cannot move out | `rust-mutability` |
| `Send` / `Sync` errors, `'static` task captures | `rust-concurrency` (topology → `rust-async-pattern`) |
| "one type is more general", HRTB / GAT conflicts | `rust-lifetime-complex` |
| const-generic or const-eval errors | `rust-const` |

### Performance

| Symptom | Skill |
|---|---|
| Basic optimization, benchmarks, allocation churn | `rust-performance` |
| False sharing, lock contention, NUMA | `rust-performance` (+ `rust-mutability`) |
| Concurrency throughput | `rust-concurrency` (rayon, bounded fan-out) |
| Cache misses, data layout | `rust-performance` (dense index, `#[repr]`, arena) |
| Abstraction cost, monomorphization, binary size | `rust-zero-cost` |
| Caching at the service layer | `rust-cache` |

### Async

| Symptom | Skill |
|---|---|
| Basic `async`/`await`, spawn, channels | `rust-concurrency` |
| Streams, `select!`, backpressure, timeouts | `rust-async` |
| `tokio::spawn` `'static` errors, workers, plugins | `rust-async-pattern` |
| `Future` + `Pin` | `rust-pin` |
| Generators, suspend/resume, stackful vs stackless | `rust-coroutine` |
| Must-consume APIs, preventing an implicit drop | `rust-linear-type` |
| Actor model, message passing | `rust-actor` |

### Errors

| Symptom | Skill |
|---|---|
| `Result` / `Option`, `?`, context, panics | `rust-error` |
| `thiserror` / `anyhow`, source chains, retryable errors, HTTP mapping | `rust-error-advanced` |
| Error design smells (string errors, catch-all variants) | `rust-anti-pattern` |

### Type system

| Symptom | Skill |
|---|---|
| HRTB, GAT, `'static`, `dyn` bounds | `rust-lifetime-complex` |
| Procedural macros, derives | `rust-macro` |
| Const generics, compile-time validation | `rust-const` |
| Typestate, newtype, `PhantomData` | `rust-type-driven` |

### Services and infrastructure

| Symptom | Skill |
|---|---|
| Axum handlers, extractors, state, graceful shutdown | `rust-web` |
| CORS, rate limits, timeouts, layer ordering | `rust-middleware` |
| Authn/authz, tokens, password storage | `rust-auth` |
| Redis caching and invalidation | `rust-cache` |
| Actor systems | `rust-actor` |
| SQLx / Diesel / SeaORM, transactions, migrations | `rust-database` |
| Consensus, idempotency, retries, sagas, outbox | `rust-distributed` |
| Tracing, metrics, OpenTelemetry | `rust-observability` |

### Systems

| Symptom | Skill |
|---|---|
| `unsafe`, raw pointers, memory operations | `rust-unsafe` |
| Leaks, `Drop`, file handles, cleanup on the error path | `rust-resource` |
| C / C++ / Python interop, C++ exceptions | `rust-ffi` |
| `no_std`, embedded, RISC-V, ISR | `rust-embedded` |
| eBPF, kernel modules | `rust-ebpf` |
| GPU compute, CUDA, shaders | `rust-gpu` |
| DPDK, packet processing | `rust-dpdk` |

### Algorithms and data

| Symptom | Skill |
|---|---|
| Which sort / search / structure, and at what cost | `rust-algorithms` |
| Graph traversal, shortest path, SCC, matching, max flow | `rust-algorithms` |
| DP, string matching, number theory, bit tricks, backtracking | `rust-algorithms` |
| Read the reference source of a named algorithm | `rust-algorithms-upstream` |

### Code quality, testing, learning

| Symptom | Skill |
|---|---|
| Style, naming, lints | `rust-coding` |
| Clones, unwraps, over-abstraction | `rust-anti-pattern` |
| Test design, proptest, mockall, loom, criterion | `rust-testing` |
| Editions, versions, new features, learning path | `rust-learner` |
| Crate selection | `rust-ecosystem` |

## Chaining

- **Rust → wasm:** `rust-skill` → `rust-wasm` → `rust-wasm-performance` → `rust-wasm-audit`.
- **New service:** `rust-coding` (layout) → `rust-web` (routes) → `rust-middleware` → `rust-auth`
  → `rust-error` / `rust-error-advanced` (API errors) → `rust-database` → `rust-cache` →
  `rust-observability`.
- **Making it fast:** `rust-performance` first; `rust-concurrency` or `rust-async` only when the
  profile points there.
- **Making it sound:** `rust-unsafe` for the procedure → `rust-skills` (`unsafe-*`) for rule text.
- **Making it idiomatic:** `rust-anti-pattern` to find the smell → the owning topic skill to fix it.
- **Stuck on a type error:** `rust-ownership` → `rust-mutability` → `rust-lifetime-complex`;
  escalate to `rust-type-driven` only when the design itself is wrong.

## Coverage note

Every skill this router names is shipped. There is deliberately no separate `rust-skill-index`: this
file is the index, and a second one would duplicate it. Coverage gaps (e.g. XACML engines beyond
`rust-xacml`) route to `rust-skill` for the workflow and `rust-skills` for the rule text.

Credits for every upstream skill, rule set and book this pack is built on: see `CREDITS.md`.
