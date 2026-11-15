---
name: rust-zero-cost
description: Explain what zero-cost abstraction means in Rust and where the abstraction does cost you — monomorphization, static vs dynamic dispatch, iterator chains, and code bloat. Use when the user mentions zero-cost, monomorphization, generic code size, static vs dynamic dispatch, `impl Trait`, iterator chain cost, code bloat, binary size, `#[inline]`, or abstraction overhead, or asks whether a generic beats a `dyn Trait`, whether a chain costs more than a loop, or why the binary grew.
---

# Zero-Cost Abstractions

Zero-cost is a claim about **runtime** only: you do not pay for what you do not use, and what you do
use compiles to what you would have written by hand. **Leading word: codegen.** It says nothing about
compile time or binary size, which is where the bill actually arrives. Every sentence below is meant
to be checked against emitted code in a release profile, never asserted from the slogan.

## Route first

| Concern | Go to |
|---|---|
| Rule text: dispatch, inlining, layout, iteration | `rust-skills` → `trait-dyn-vs-generic`, `opt-inline-small`, `opt-inline-never-cold`, `opt-lto-release`, `opt-codegen-units`, `type-repr-transparent`, `num-nonzero`, `perf-iter-lazy`, `perf-collect-once`, `anti-format-hot-path`, `mem-box-large-variant`, `mem-assert-type-size` |
| The workflow for the code being written | `rust-skill` |
| Benchmark, profile, release-profile flags | `rust-performance` |
| Binary or wasm payload size | `rust-wasm-performance` |
| Copies, clones and buffers behind the abstraction | `rust-ownership`, `rust-anti-pattern` |
| Parallelism, atomics, contention | `rust-concurrency` |
| Boxing futures, task size, `Box::pin` | `rust-async` |
| Fat pointers, vtable layout, ABI | `rust-unsafe` |
| Tests that pin a size or an allocation count | `rust-testing` |

## Playbook

1. **Name the cost you mean.** Runtime, compile time, or binary size — zero-cost refers to the first
   only. *Done when* the claim carries a cost class and a workload.
2. **Count the instantiations.** Every generic `fn`, `impl` or `struct` is stamped once per concrete
   type; `impl Trait` in argument position is the same trade with shorter syntax. A generic called
   with forty types is forty bodies, and with `lto = "fat"` they may inline into forty call sites.
   *Done when* the instantiation count for each hot generic is known, not assumed.
3. **Pick dispatch by hot path versus code size.**

   | Situation | Choose | What you buy, what you pay |
   |---|---|---|
   | one or two concrete types on the hot path | generic / `impl Trait` | inlinable, no indirect call; one body per type |
   | many types, wide call graph, size-bound build | `&dyn Trait` | one body, one indirect call per method; no inlining |
   | heterogeneous collection, runtime registry | `Box<dyn Trait>` | the only way to store them; an allocation and a vtable hop |
   | a library's public API | generic where hot, `dyn` where the body is large | leaves the choice to the caller |

   *Done when* each choice cites an instantiation count or a `cargo bloat` line, not taste.
4. **Read an iterator chain as a loop.** `map` / `filter` / `take` inline into the body of one loop:
   nothing allocated per element, no virtual call, nothing left for you to hand-optimise. `collect`
   is the one allocation — and over a `filter` it grows the buffer, because the adapter cannot report
   a lower bound. *Done when* the disassembly of the chain and of the hand-written `for` loop agree on
   the loop body.
5. **Pin the layouts you rely on.** A newtype and its `#[repr(transparent)]` wrapper cost nothing;
   `Option<&T>` and `Option<NonZeroU32>` reuse a niche, so they stay pointer- and word-sized.
   *Done when* a `const` assertion beside the type states the size you expect.
6. **Audit what is not free.** `format!`, `Box`, `Rc` / `Arc`, `dyn`, bounds checks the optimizer
   cannot prove away, a `clone` inside a loop, and any `Box<dyn Future>` or `Box::pin` in a handler.
   Each is allowed where the design or the profile asks for it, nowhere by accident. *Done when*
   every occurrence on a hot path has its reason written beside it.
7. **Verify, then claim.** `cargo asm` for one function, `cargo bloat --release` ranked by size,
   `nm --size-sort` on the binary, the existing criterion benches for the runtime half. *Done when*
   "this is zero cost" has emitted code, a size number or a bench delta behind it.

## Examples

```rust
// Adapters allocate nothing; `collect` is the one allocation, and it pre-sizes
// from the slice length because `Map` keeps an exact size hint.
fn checksums(rows: &[Row]) -> Vec<u32> {
    rows.iter().map(Row::sum).collect()
}

// The same control flow, written out. Shorter is not faster — these compile alike.
fn checksums_loop(rows: &[Row]) -> Vec<u32> {
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(row.sum());
    }
    out
}
```

```rust
use std::io::{self, Write};

// Static: one body per writer type, inlinable, and one copy per type in the binary.
fn dump<W: Write>(w: &mut W, rows: &[Row]) -> io::Result<()> {
    for row in rows {
        writeln!(w, "{}", row.sum())?;
    }
    Ok(())
}

// Dynamic: one body in total, an indirect call per `write`. Choose it when the set of
// writers is open, or when the static version would duplicate this body N times.
fn dump_dyn(w: &mut dyn Write, rows: &[Row]) -> io::Result<()> {
    for row in rows {
        writeln!(w, "{}", row.sum())?;
    }
    Ok(())
}
```

```rust
use std::mem::size_of;
use std::num::NonZeroU32;

#[repr(transparent)]
struct Millis(u64);

// Layout is the abstraction's whole cost, and it is checkable rather than arguable.
const _: () = assert!(size_of::<Millis>() == size_of::<u64>());
const _: () = assert!(size_of::<Option<NonZeroU32>>() == size_of::<u32>());
```

## Hard rules

- Zero-cost is a runtime claim; saying it about compile time or binary size is a different, false claim.
- Generics and `impl Trait` arguments monomorphize alike — only `dyn` stops the code count from growing.
- `#[inline]` is a cross-crate hint; `#[inline(always)]` is a measured exception on a profiled path.
- Never narrate assembly you did not build: no "the compiler emits X" without the emitted code.
- Every `Box`, `format!`, `clone` and `dyn` on a hot path is a cost until the codegen says otherwise.

## Done when

- the claim names runtime, compile time or binary size, and the workload it applies to
- each dispatch choice is backed by an instantiation count or a `cargo bloat` line
- every newtype and niche wrapper has a `size_of` assertion on the boundary it crosses
- a `cargo asm` or `cargo bloat` diff exists for any function called zero cost
