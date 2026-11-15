# Hot-path optimization — the procedure

The companion to `performance.md` (which is the catalogue of costs). This file is the
*order of operations* for "make this function faster without changing what it does", plus
a worked case study with real numbers.

Rule zero: **no optimization without a measurement.** If you cannot state the current
number (time per call, allocations per call, or throughput), you are guessing.

---

## Phase 0 — pin the behaviour

Before touching anything, make the contract executable:

1. Read the existing tests. If the function has none, write one that golden-values the
   outputs (money, ids, ordering) **before** refactoring.
2. Record the invariants the refactor could break: iteration order of output, rounding
   mode, inclusive/exclusive bounds, "first matching row wins" precedence.
3. Keep one test that compares the new implementation against a copy of the old one over a
   grid of inputs. This is what lets you claim "same behaviour" instead of hoping.

```rust
#[test]
fn indexed_lookups_match_the_per_call_formulas() {
    for base in [Decimal::ZERO, d(1), d(15_000_000), Decimal::MAX] {
        for payer in [Payer::Employee, Payer::Employer] {
            assert_eq!(fast_lookup(base, payer), reference_lookup(base, payer));
        }
    }
}
```

Pre-dividing a rate by 100, caching a factor, or switching a linear scan for a binary
search are all "the same maths" only until a rounding boundary. Prove it.

---

## Phase 1 — signature audit (free wins, zero risk)

Look at each parameter and return type. Every owned type crossing the boundary is a
potential copy the caller did not ask for.

| Smell | Replace with | Why |
|---|---|---|
| `&String` | `&str` | callers with `&str`/literals stop allocating |
| `&Vec<T>` | `&[T]` | accepts arrays, slices, `Vec`, `Box<[T]>` |
| `&PathBuf` | `&Path` | same |
| `&Option<T>` parameter | `Option<&T>` | no temporary, no move |
| `Vec<T>` parameter where the callee only reads | `&[T]` | caller keeps ownership |
| `String` return where data is borrowed | `&'a str` / `Cow<'a, str>` | zero-copy |
| `Box<dyn Fn(..)>` in a hot loop | `impl Fn` (generic) | monomorphize + inline |
| `HashMap` parameter | `impl IntoIterator<Item = (&K, &V)>` or a small struct | let the caller choose |

Also audit *return* shape: `Vec<&'a T>` (borrowed views), `impl Iterator<Item = &'a T>`
(fully lazy) or `Cow<'a, [T]>` (sometimes-owned) often delete a clone the caller was
doing anyway.

---

## Phase 2 — allocation audit

Count them; do not eyeball. Two techniques:

1. **Criterion can't see allocations** — install a counting global allocator in the
   benchmark binary:

```rust
static ALLOCATIONS: AtomicU64 = AtomicU64::new(0);

struct Counting;
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        unsafe { System.alloc(l) }
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) { unsafe { System.dealloc(p, l) } }
    unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 {
        ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        unsafe { System.realloc(p, l, n) }
    }
}
#[global_allocator]
static A: Counting = Counting;
```

   Reset the counter, run the function N times, print `allocs / N` next to the timing.
   (Do not use a thread-local here if you benchmark parallel code — use a relaxed atomic
   and accept the cache-line chatter, or count only the sequential variant.)

2. **`heaptrack` / `dhat` / `massif`** for a real workload.

Then fix in this order:

- **Static text** → `&'static str` (fixed labels, codes, names).
- **Per-item `Vec::new()`** → `Vec::with_capacity(MAX_ITEMS)` (you know the max: brackets,
  lines per invoice, columns per report).
- **Per-item buffers in a loop** → one buffer outside the loop + `clear()` + a
  `*_into(&mut buf)` variant.
- **`format!` in a loop** → `write!` into a reused `String`.
- **`to_string()` on a literal** → delete.

---

## Phase 3 — structure audit (complexity)

- **Closed key space → dense index.** An enum-keyed lookup belongs in an array indexed by
  a `const fn index(self) -> usize`, not a `HashMap`. Add the `index()` next to the enum so
  a new variant breaks every match site.
- **Build derived tables once per batch, not per item.** Precompute what is constant:
  `pct / 100`, `1 + surcharge/100`, caps, resolved config rows. `Decimal` division is one
  of the most expensive ops in a money loop.
- **Open key space → `entry`.** `contains_key` + `insert` hashes twice; `entry` hashes once.
- **Sorted slice → `partition_point`**, not `find` (and enforce sortedness in `validate`).
- **Filtering a `Vec` → `retain`**; **removing a known index → `swap_remove`**; `remove`
  only when order must survive. (Measured: 1.47 s vs 0.98 ms on 20k rows.)
- **Sort references, not values**: `Vec<&'a T>` + `sort_unstable_by` avoids cloning every
  element to sort it.

---

## Phase 4 — streaming instead of materialising

If the caller only needs an aggregate, do not build the intermediate collection at all.
Reshape the core into a sink:

```rust
// one core, three callers, zero duplicated logic
fn render(&self, input: &Input, sink: &mut impl FnMut(Line, Share)) { /* ... */ }

pub fn compute(&self, i: &Input) -> Vec<Line>          { /* collect, sized */ }
pub fn compute_into(&self, i: &Input, out: &mut Vec<Line>) { /* reuse buffer */ }
pub fn totals(&self, batch: &[Input]) -> Totals        { /* fold, no buffer */ }
```

`impl FnMut` is monomorphized — the closure inlines into `render`, so the "callback" costs
nothing. This converts "one `Vec` per item" into "one `Vec` per batch" or "zero".

---

## Phase 5 — parallelism (only now)

Order matters: parallelising an allocation-heavy loop parallelises the allocator.
Make it allocation-free first, then:

1. Build the expensive shared read-only state (config index) **once**.
2. `par_iter().fold(identity, op).reduce(identity, merge)` — per-thread accumulators,
   no `Mutex`.
3. Merge must be associative (integers/`Decimal` are; floats are not).
4. Gate `rayon` behind an optional feature if the crate also builds for `wasm32`.
5. Warm the pool once at startup so the first timed batch does not pay thread creation.

---

## Phase 6 — benchmark protocol

```rust
fn bench(c: &mut Criterion) {
    let mut g = c.benchmark_group("batch_totals");
    g.throughput(Throughput::Elements(n as u64)); // report elems/s, not just time
    g.sample_size(10);                             // for 100k-1M item benches
    g.measurement_time(Duration::from_secs(3));
    g.bench_with_input(BenchmarkId::new("optimized", n), &employees, |b, e| {
        b.iter(|| index.totals(black_box(e)));
    });
}
```

- Scale across **at least three magnitudes** (1k / 100k / 1M). Fixes with a constant factor
  hide at 1k and dominate at 1M; concurrency wins appear only above ~10k items.
- `black_box` the inputs (and results you do not consume).
- Keep the baseline implementation in the benchmark file so the comparison survives the
  refactor. Never benchmark against "how it felt".
- Benchmark the *sequential* and *parallel* variants separately — the crossover point is
  information you will need in production.
- Slow benchmarks: `sample_size(10)`, `measurement_time(3s)`, and a `--quick` pass in CI.
  Report throughput so numbers are comparable across sizes.

---

## Case study — payroll engine, 1k → 1M employees

Pure domain code: PPh21 + BPJS over `rust_decimal`. Changes, in phase order:

| Phase | Change | Effect |
|---|---|---|
| 1 | n/a (already `&EmployeeCalc`) — added `&[EmployeeCalc]` batch entry points | enables phases 4-5 |
| 2 | `label: String` → `&'static str`; `Vec::new()` → `with_capacity(14)`; `*_into` buffer reuse | 17 000 → 1 000 allocs per 1 000 employees; **0** for totals |
| 3 | dense `[[Decimal; 2]; 5]` BPJS matrix (was a linear scan per contribution), rates pre-divided by 100, `partition_point` over TER brackets | 5.6 → 1.3 µs per employee |
| 4 | one `render(sink)` core feeding `compute`, `compute_into`, `totals`, `component_totals` | totals allocate nothing at all |
| 5 | `par_iter().fold(reduce)` over employees, `HashMap` per worker + `entry` merge | 232 ms → 54 ms at 100k |

Final numbers (8 cores, release + fat LTO):

| workload | baseline | optimized | optimized parallel |
|---|---|---|---|
| 1 employee | 5.6 µs | 1.3 µs (1.4 µs w/ reused buffer) | — |
| 100k employees, totals | 752 ms | 189 ms | **54 ms** |
| 1M employees, totals | — | 1.87 s | **0.49 s** |
| 100k employees, lines | 768 ms | 251 ms | 74 ms |

Every optimisation above was verified by an equivalence test against the old algorithm;
the unit tests covering the DJP worked examples pass unchanged.

---

## Checklist

- [ ] Golden/equivalence test exists and passes before and after.
- [ ] Parameters take `&str`/`&[T]`; returns borrow when the data is already owned elsewhere.
- [ ] Allocation count measured before and after (counter, not vibes).
- [ ] No `to_string()`/`format!`/`Vec::new()` in the per-item path.
- [ ] Enum-keyed lookups are dense arrays; derived constants precomputed per batch.
- [ ] Aggregations stream; intermediates only exist if the caller consumes them.
- [ ] Parallel path is feature-gated where `wasm32` is a target, and the pool is warmed.
- [ ] Criterion covers 1k / 100k / 1M with `Throughput`; baseline kept in the bench file.
- [ ] `cargo clippy -- -D warnings` clean; no new `unwrap` on a data path.
