# perf-batch-fold-reduce

> Aggregate batches with rayon fold/reduce — never a shared `Mutex`

## Why It Matters

`par_iter().map(...).collect()` is the right shape when you *produce* a value per item. When you **aggregate** items into one value, a shared `Mutex<Accumulator>` serialises every worker at a single lock, which often makes the parallel version slower than the sequential one. `fold(identity, op)` gives each rayon split its own accumulator on its stack; `reduce(identity, op)` merges the partial aggregates once, at the end. No lock, no contention, no allocation.

Measured on a 100k-employee payroll batch (8 cores, `rust_decimal` money math):

| variant | time | throughput |
|---|---|---|
| sequential loop | 232 ms | 0.43 Melem/s |
| parallel fold/reduce | 54 ms | 1.85 Melem/s |
| parallel with `Mutex` | ~5× worse than sequential | — |

The same pattern at 1,000,000 employees: 1.87 s → 0.49 s.

## Bad

```rust
use std::sync::{Arc, Mutex};

let totals = Arc::new(Mutex::new(Totals::default()));
employees.par_iter().for_each(|e| {
    let lines = rules.compute(e);        // allocates per employee, too
    let mut acc = totals.lock().unwrap(); // every employee serialises here
    acc.add(&lines);
});
```

## Good

```rust
#[derive(Clone, Copy, Default)]
struct Totals {
    employees: u64,
    employer: Decimal,
    employee: Decimal,
    tax: Decimal,
}

impl Totals {
    fn merge(self, other: Self) -> Self {
        Self {
            employees: self.employees + other.employees,
            employer: self.employer + other.employer,
            employee: self.employee + other.employee,
            tax: self.tax + other.tax,
        }
    }
}

let totals = employees
    .par_iter()
    .fold(Totals::default, |mut acc, e| {
        // stream into the accumulator: no line buffer at all
        rules.accumulate_into(e, &mut acc);
        acc
    })
    .reduce(Totals::default, Totals::merge);
```

## Requirements

- **Associativity.** The merge must be associative, or the result depends on how rayon splits the slice. `Decimal`/integer addition is exact and associative — splitting never changes a rupiah. Floating-point addition is **not** associative: sum floats sequentially, or use a compensated/Kahan accumulator with a deterministic final reduction.
- **`Send` accumulators.** `HashMap`, `Decimal`, plain structs all qualify; `Rc`, `RefCell`, raw pointers do not.
- **Cheap identity.** `Totals::default()` runs per split; do not build a big `String` or a populated map in it.
- **Warm the pool once.** The first `par_iter` in a process pays thread creation (~10-100 ms). Pay it at startup, not inside the first timed batch, or small batches look catastrophic.
- **Don't force it.** Below ~10k items the pool overhead can exceed the work; offer a sequential entry point and pick by batch size.

## Use `for_each_with` when a map cannot be merged cheaply

If merging per-thread maps genuinely dominates, use one map per worker and merge once — still no lock:

```rust
let per_worker = employees
    .par_iter()
    .fold(HashMap::new, |mut acc, e| {
        acc.entry(e.component).or_insert(Decimal::ZERO) += e.amount;
        acc
    })
    .reduce(HashMap::new, merge_maps);
```

## wasm / feature gating

If the crate is also compiled to `wasm32` (shared DTO/domain crate, Leptos frontend), rayon must be an **optional** dependency behind a feature:

```toml
[dependencies]
rayon = { workspace = true, optional = true }

[features]
parallel = ["dep:rayon"]
```

```rust
#[cfg(feature = "parallel")]
use rayon::prelude::*;
```

Keep one public sequential entry point so wasm and tests exercise the same code path, and add the parallel one next to it (`totals` / `totals_parallel`) rather than changing behaviour behind a feature flag — hidden behaviour switches are worse than an explicit second function.

## See Also

- [conc-rayon-par-iter](./conc-rayon-par-iter.md) — the base `par_iter` patterns
- [perf-entry-api](./perf-entry-api.md) — the per-worker `HashMap` update
- [anti-lock-across-await](./anti-lock-across-await.md) — the async sibling of this problem
- [test-criterion-bench](./test-criterion-bench.md) — prove the speedup, and the scaling
- [mem-with-capacity](./mem-with-capacity.md) — size each worker's map up front
