# perf-dense-index-over-map

> Closed key space → array index, open key space → `HashMap::entry`

## Why It Matters

A `HashMap` is the default reflex for "look something up by key", but hashing is only worth it when the key space is open and sparse. When the key is a small `enum` (BPJS program × payer, PTKP status, currency, channel), the discriminant *is* the index: a fixed array lookup is a bounds check and a load — no hash, no probe, no allocation, no `PhantomData` dance.

Measured on a per-employee payroll batch (10 BPJS lookups per employee, 1M employees):

```rust
// linear scan over 8 rate rows, twice per program
rates.iter().find(|r| r.program == program && r.payer == payer)   // ~2 µs/employee

// dense matrix indexed by discriminant
matrix[program.index()][payer.index()]                             // ~1.3 µs/employee
```

The matrix version also let the rate be **pre-divided** by 100 at index-build time, removing 10 `Decimal` divisions per employee — on `rust_decimal`, division is the single most expensive operation in this loop.

## Bad

```rust
// 10 lookups per employee, each a linear scan re-deriving the same answer
fn contribution(rates: &[BpjsRate], program: Program, payer: Payer, base: Decimal) -> Decimal {
    rates
        .iter()
        .find(|r| r.program == program && r.payer == payer)
        .map(|r| base * r.rate_pct / Decimal::ONE_HUNDRED)
        .unwrap_or(Decimal::ZERO)
}

// or, just as wasteful: a HashMap rebuilt per call
let by_key: HashMap<(Program, Payer), Decimal> = rates.iter()...collect();
```

## Good

```rust
#[derive(Clone, Copy)]
struct RateIndex<'a> {
    /// [program][payer]; ZERO = not configured, MAX = uncapped.
    rate: [[Decimal; 2]; 5],
    cap: [[Decimal; 2]; 5],
    /// borrowed, not copied
    annual: &'a [Bracket],
}

impl RateIndex<'_> {
    #[inline]
    fn contribution(&self, program: Program, payer: Payer, base: Decimal) -> Decimal {
        let rate = self.rate[program.index()][payer.index()];
        if rate == Decimal::ZERO {
            return Decimal::ZERO;
        }
        (base.min(self.cap[program.index()][payer.index()]) * rate).round_dp(0)
    }
}
```

Rules that keep this honest:

- `const fn index(self) -> usize` on the enum lives next to the enum, so adding a variant is a compile error at every match site.
- Build the table **once per batch**, not per item (`RuleIndex::build` is allocation-free).
- Add the invariant to `validate()` — first-row-wins precedence, ascending bounds — so a mis-seeded table fails the batch instead of silently mis-charging.

## Open key space? Then size the map and use `entry`

```rust
let mut per_component = HashMap::with_capacity(KNOWN_CODES.len());
for line in lines {
    *per_component.entry(line.code).or_insert(Decimal::ZERO) += line.amount;
}
```

`with_capacity` removes the rehash reallocations; `entry` hashes once. Both matter at 14M lines, neither is visible at 14.

## Sorted slice? `partition_point`, not `find`

A linear `find` over a sorted schedule is a missed binary search:

```rust
// BEFORE: first bracket whose upper bound fits — O(n)
let rate = brackets.iter().find(|b| base <= b.upper_bound).map(|b| b.rate_pct);

// AFTER: same answer — O(log n), and ~10× fewer comparisons at 44 rows
let i = brackets.partition_point(|b| b.upper_bound < base);
let rate = brackets.get(i).map_or(Decimal::ZERO, |b| b.rate_pct);
```

`partition_point` returns the count of elements for which the predicate is **true**, so with an ascending schedule `partition_point(|b| b.upper_bound < base)` is exactly the index of the first bracket that fits. That equivalence is only valid while the slice is sorted — enforce it in `validate()` or the search silently picks the wrong bracket. Add a test that compares the binary search against the old linear scan over the boundary values.

## See Also

- [perf-entry-api](./perf-entry-api.md) — single-hash insert-or-update for open key spaces
- [mem-with-capacity](./mem-with-capacity.md) — pre-size the map you keep
- [coll-map-choice](./coll-map-choice.md) — hash vs `BTreeMap` vs `IndexMap`
- [coll-set-membership](./coll-set-membership.md) — the same reflex, for sets
- [type-no-stringly](./type-no-stringly.md) — stringly keys are what block the dense index
- [perf-batch-fold-reduce](./perf-batch-fold-reduce.md) — build the index once, share it across threads
