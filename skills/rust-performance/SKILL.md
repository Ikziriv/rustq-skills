---
name: rust-performance
description: Optimize Rust performance with measurement first — criterion benchmarks, profiling, allocation and cache analysis, and targeted codegen tuning (LTO, PGO, SIMD, inlining). Use when the user mentions performance, slow, benchmark, criterion, allocation, profiling, false sharing, PGO, LTO, SIMD, or cache, or asks to make a function, hot loop, or pipeline faster.
---

# Rust Performance

**Measure** before editing a line. "Faster" means the same benchmark, on the same input, with the same release profile, says so twice — and allocations per call did not move the wrong way.

Intuition ranks bottlenecks wrong often enough that an unmeasured optimization is a coin flip with extra risk. Any number you quote must come from your own run; if there is no measurement, there is no claim.

## Route first

| Task | Go to |
|---|---|
| Rule text for `perf-*`, `opt-*`, `mem-*` | `rust-skills` |
| Hot-path refactor procedure, performance reference | `rust-skill` |
| Data structure and algorithm choice | `rust-skills` (`coll-*`), `rust-skill` |
| Ownership shape behind an allocation | `rust-ownership` |
| Contention, atomics, false sharing, parallel iterators | `rust-concurrency` |
| Task overhead, `spawn` vs `spawn_blocking`, batching | `rust-async` |
| Per-request cost in a service | `rust-web` |
| wasm binary size or runtime speed | `rust-wasm-performance` |
| Keeping the optimized code readable | `rust-coding` |

## Playbook

1. **Pin the metric and the workload.** Latency p50/p99, throughput, allocations per call, peak RSS, or binary size — pick one, name the input corpus, name the command. *Done when* the metric, input, and command are written down before any benchmark file exists.
2. **Baseline in release, with production's flags.** Verify `[profile.release]` actually sets `lto` and `codegen-units`, since a bench in debug or with default codegen measures the wrong program (`perf-release-profile`, `opt-lto-release`, `opt-codegen-units`). *Done when* the baseline number and the profile flags it was built with are recorded together.
3. **Profile, do not guess.** Time: `perf record -g`, `cargo flamegraph`, or `samply`. Allocations: DHAT, heaptrack, or a counting global allocator. *Done when* one function or allocation site is named as the top cost, with a share of total (`perf-profile-first`).
4. **Classify, then apply the matching fix.** Use the table below. *Done when* the finding is labelled algorithmic, allocation, dispatch, layout, contention, or codegen — the label decides the fix.
5. **Change one thing and re-measure identically.** Keep the change only if the delta exceeds criterion's noise threshold; otherwise record "no measurable change" and revert. *Done when* before/after come from the same command and the same input.
6. **Reach for codegen knobs last.** PGO, `target-cpu`, SIMD, and inlining only after steps 1–5 are exhausted, and only for code the profile already names (`opt-pgo-profile`, `opt-simd-portable`, `opt-target-cpu`). *Done when* a knob has its own before/after.

| Profile signature | First move |
|---|---|
| `malloc`/`free` wide in the flamegraph | reuse buffers (`mem-reuse-collections`, `perf-drain-reuse`), pre-size with capacity, write into one `String` (`mem-write-over-format`, `mem-avoid-format`) |
| `memcpy` wide | stop cloning or passing by value (`own-borrow-over-clone`, `anti-clone-excessive`) |
| SipHash / hashbrown hot | non-crypto hasher for trusted keys (`perf-ahash`), dense `Vec` indexed by id instead of a map (`perf-dense-index-over-map`) |
| Bounds checks visible | iterate instead of indexing (`perf-iter-over-index`, `anti-index-over-iter`) |
| Lock or atomic hot | shrink the critical section, shard the state, batch (`rust-concurrency`) |
| Cache misses on one field | split hot and cold fields, pack the hot ones (`opt-cache-friendly`) |
| Branchy inner loop | PGO first, hints only after (`opt-pgo-profile`, `opt-cold-unlikely`) |
| Uniform cost with no single hot function | LTO + `codegen-units = 1` + `target-cpu`, then re-profile (`opt-lto-release`) |
| Vectorizable arithmetic loop | portable SIMD (`opt-simd-portable`) |
| Recomputed identical results | hoist, memoize, or restructure the loop (`perf-entry-api`, `perf-batch-fold-reduce`) |

```toml
# Cargo.toml — a bench target needs harness = false
[[bench]]
name = "normalize"
harness = false
```

```rust
use criterion::{Criterion, Throughput, criterion_group, criterion_main};
use std::hint::black_box;

fn bench_normalize(c: &mut Criterion) {
    let input = "  Alice SMITH  ";
    let mut group = c.benchmark_group("normalize");
    group.throughput(Throughput::Bytes(input.len() as u64));
    group.bench_function("baseline", |b| b.iter(|| normalize(black_box(input))));
    group.finish();
}

criterion_group!(benches, bench_normalize);
criterion_main!(benches);
```

`black_box` stops the optimizer from hoisting the call out of the loop, which is the most common way a benchmark lies (`perf-black-box-bench`, `test-criterion-bench`).

## Hard rules

- No optimization lands without a before/after from the same command, input, and profile.
- Benchmark release builds with production's profile; debug timings measure the wrong program.
- Report allocations per call and peak memory whenever the change touches allocation — a time win that doubles memory is a trade, not a win.
- Behaviour tests stay green throughout; a "faster" change that alters output is a different change and needs its own commit.
- No `unsafe` or `#[inline(always)]` added to chase a number the profile has not named.

## Done when

- Baseline and result are recorded with identical command, input, and release profile.
- The comparison states a delta or says "no measurable change" — never "should be faster".
- Every kept change has one line tying it to the profile finding that justified it.
- Every reverted change has its reason recorded, so it is not re-attempted blind.
