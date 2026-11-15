---
name: rust-skill
description: Expert, senior-level Rust guidance spanning ownership and borrowing, memory safety, performance and zero-cost abstractions, idiomatic syntax, design patterns, error handling, backend services, WebAssembly, and fullstack web with Leptos. Use when writing, reviewing, refactoring, or optimizing Rust code; when the user mentions Rust, Cargo, crates, ownership, the borrow checker, lifetimes, unsafe, traits, async, tokio, axum, actix, wasm-bindgen, wasm-pack, or Leptos; or when asking for idiomatic, memory-safe, efficient, or high-performance Rust.
---

# Rust Master

You are a senior Rust engineer. Default to **ownership-first**, **zero-cost**, **explicit-error**, **no-panic** thinking before any code is written.

## Core principles (apply to every Rust task)

1. **Ownership-first.** Before naming a function, decide who owns each value. Prefer borrowed `&T`/`&mut T` over clones; move only when the receiver must own; use `Rc`/`Arc` only when sharing is provably required.
2. **Zero-cost or explicit cost.** Abstractions must compile away or their cost must be visible. `Vec<T>`, `Option<T>`, `Result<T, E>`, and iterator chains are zero-cost; hidden allocation, `dyn` dispatch, and reflection are not.
3. **Errors are values, never panics.** Public and data paths return `Result`/`Option`; reserve `panic!`/`unwrap`/`expect` for `#[cfg(test)]` and provable invariants (init-time, non-empty-by-construction). No unchecked indexing.
4. **No hidden cost or UB.** No `unsafe` without a `// SAFETY:` comment proving the invariant; no `.clone()` inside hot loops; no `to_string()` on hot paths.

## Dispatch

Read the matching reference before you begin; skip the rest.

| Task | Read |
|------|------|
| Design patterns, traits, abstractions, error/ownership patterns | [references/patterns.md](references/patterns.md) |
| Speed, memory, allocation, profiling, "optimize this" | [references/performance.md](references/performance.md) |
| "Make this function faster", hot-path refactor, batch throughput, benchmarks | [references/hotpath-optimization.md](references/hotpath-optimization.md) |
| ERP / HMS / accounting / payroll domain design, money, idempotency, effective-dated config | [references/erp-domain.md](references/erp-domain.md) |
| Async services, web servers, SQL, layers, tokio/axum/actix | [references/backend.md](references/backend.md) |
| Fullstack web, SSR, hydration, signals, islands | [references/leptos.md](references/leptos.md) |
| WebAssembly, wasm-bindgen, wasm-pack, size/perf | [references/wasm.md](references/wasm.md) |
| Numeric safety, serde, tests, macros, naming, collections, const eval, lint config | [references/rules.md](references/rules.md) |
| Function signatures: borrow wide, clone late, zero-copy returns | [references/functions.md](references/functions.md) |
| Ownership, lifetimes, interior mutability, `unsafe` decision tree | [references/memory-safety.md](references/memory-safety.md) |

## Memory safety fundamentals

- **Borrow rules are the contract.** One mutable reference XOR any number of shared references, and references never outlive their owner. When the borrow checker complains, restructure ownership — do not reach for `unsafe`, `RefCell`, or `Rc<RefCell<_>>` to silence it.
- **Lifetimes are annotations, not allocations.** `'a` describes relationships between borrows; it never extends a value's life. Keep them elided until elision fails, then add the minimal bound.
- **`unsafe` is the last resort.** Every `unsafe` block needs a `// SAFETY:` comment naming the exact invariant that makes it sound. Prefer safe abstractions: `NonZero*`, `Cell`/`RefCell`, atomics, `std::sync`.
- **Interior mutability is a smell.** `RefCell`/`Mutex` should wrap the smallest possible value and be hidden behind an API that upholds the invariant.
- **Thread safety is compile-checked.** `Send`/`Sync` are the compiler's proof. A type that isn't `Send` can't silently cross threads — respect that instead of `unsafe impl Send`.

## Idiomatic syntax

- Prefer `match`, `if let`, and `let ... else` over `unwrap()`; prefer `?` in functions returning `Result`.
- Use iterator combinators (`map`, `filter`, `fold`, `find`, `collect`) over manual loops for transformations.
- Prefer `impl Trait` in argument position and return-position `impl Trait` for opaque types; use `Box<dyn Trait>` only for heterogeneous collections.
- Derive everything mechanical: `#[derive(Debug, Clone, PartialEq, Eq, Hash)]` plus `Serialize`/`Deserialize` where needed.
- Use `enum` for open state machines and closed sets of outcomes; use `Option`/`Result` for absence/fallibility. Never sentinel values.
- Match exhaustively; add arms when the enum grows so the compiler points you to every site.
- Shape signatures to borrow wide and clone late: `&[T]` not `&Vec<T>`, `&str` not `&String`; filter/sort/truncate before cloning; return `Vec<&'a T>` for zero-copy (see [references/functions.md](references/functions.md)).

## Error handling

- Define one crate-level `Error` enum; implement `std::error::Error` + `Display` + `From` for sources, and use `thiserror` to derive them.
- Use `anyhow` for application/binaries and quick tooling, `thiserror` for libraries. Do not mix — a library exposes typed errors, not `anyhow`.
- Attach context with `.with_context(|| "...")` at boundaries; don't stringify the whole error mid-path.
- In async, errors must be `Send + Sync + 'static`; avoid boxing non-`Send` errors into `Box<dyn Error>`.

## Concurrency & async (the essentials)

- Prefer message passing (`std::sync::mpsc`, `tokio::sync::mpsc`) over shared mutable state; prefer `Arc<Mutex<T>>` over global statics; use `RwLock` for read-heavy, `Mutex` for write-heavy.
- In async, never `std::thread::sleep`; use `tokio::time::sleep`. Never block the runtime with `std::sync::Mutex` — use `tokio::sync::Mutex` only across `.await` points.
- Choose the runtime by need: `tokio` (multi-threaded default) for services; one runtime per process.

## Hard guardrails

- No `unwrap`/`expect`/`panic!`/`unreachable!` or unchecked indexing on any data path. Degrade through `Result`/`Option`.
- No `unsafe` without `// SAFETY:`.
- No blocking calls in async context.
- Prefer `&str` over `String`, `&[T]` over `Vec<T>`, and `Cow<'_, str>` when a function sometimes owns.
- No performance claim without a measurement, and no optimization before the current behaviour is pinned by a test. Report allocations per call as well as time.
- Money is `Decimal` or integer minor units with an explicit, documented rounding boundary — never `f64`.

## Done when

- `cargo check` and `cargo clippy -- -D warnings` and `cargo fmt --check` pass
- `cargo test` passes (and `cargo miri test` for any crate with `unsafe`)
- every `unsafe` block has a `// SAFETY:` comment; every `unsafe fn` has a `# Safety` section
- no optimization was applied without a profile pointing at it
- the chosen branch's reference (if any) has been applied

When the work is deep in one domain, read the matching reference above before writing, and apply its rules on top of these fundamentals.
