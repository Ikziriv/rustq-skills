# Rust-specific algorithm pitfalls

Correct pseudocode fails in Rust for a handful of recurring reasons. Check these before debugging the
algorithm itself.

## Integer overflow and index math

```rust
// Binary search: (lo + hi) overflows for large slices in debug builds
let mid = (lo + hi) / 2;

// Safe: the difference never exceeds len
let mid = lo + (hi - lo) / 2;
```

- Release wraps silently; debug panics. An algorithm that "works in release" is not working.
- Use `checked_*` where the mathematical value can exceed the type, `saturating_*` for counters, and
  `wrapping_*` only when wrapping is the intended semantics (hashing, bit tricks).
- `usize` subtraction underflows: prefer `a.saturating_sub(b)` or order the branches.
- Multiplying moduli (`a * b % m`) overflows `u64` once `m > 2³²`; compute in `u128`.
- Shifts by `>= bit_width` are an overflow (panic in debug); mask or use `checked_shl`.
- Casting with `as` truncates silently: use `try_into()` for lengths and values from outside.

## Float ordering and accumulation

```rust
// NaN makes partial_cmp return None; unwrap() panics on adversarial data
values.sort_by(|a, b| a.partial_cmp(b).unwrap());

// Total order, NaN sorted last
values.sort_by(f64::total_cmp);
```

- `f64` implements neither `Ord` nor `Eq`, so it cannot key a `BTreeMap` or `HashMap` directly. Sort
  with `total_cmp`; for approximate equality use an explicit tolerance, never `==`.
- For maps keyed by floats: `ordered_float::OrderedFloat`, or key by the bit pattern with a documented
  NaN policy.
- Long sums of small floats lose precision; use `f64` instead of `f32`, pair-wise/Kahan summation, or
  an integer representation (minor units) for money.
- `-0.0 == 0.0` is true but their bit patterns differ — hashing by bits must normalise first.

## Recursion depth

Rust has no tail-call guarantee. A DFS or backtracker on input-controlled depth overflows an ~8 MB
main-thread stack, and a worker thread's default stack is smaller.

```rust
// Explicit stack instead of recursion for unbounded depth
let mut stack = vec![start];
let mut seen = vec![false; n];
seen[start] = true;
while let Some(node) = stack.pop() {
    for &next in &adj[node] {
        if !seen[next] {
            seen[next] = true;
            stack.push(next);
        }
    }
}
```

- Convert to an explicit `Vec` stack when depth is data-driven.
- A recursive algorithm on a bounded domain (segment tree over `n`, `log n` deep) is fine; say why.

## Graph representation and the borrow checker

- Store **indices**, not references: `adj: Vec<Vec<usize>>`, weights alongside, node data in a
  parallel `Vec`. Returning `&Node` from a mutable traversal fights the borrow checker by design.
- `Rc<RefCell<Node>>` graphs compile but cost cache locality and invite runtime panics. Use them only
  for genuinely shared mutable structures, and prefer `slotmap`-style arena handles.
- Removing edges/nodes: mark deleted (`Option<T>` / tombstone) and compact later; do not
  `Vec::remove` inside a traversal.
- Build once, then traverse: mutable adjacency during traversal means indices are invalidated.

## Allocation and cloning

- `Vec::with_capacity(exact)` when the size is known; growth copies.
- Reuse buffers across iterations (`clear()` keeps capacity) instead of allocating per step.
- `clone()` inside a loop is the usual cause of a correct algorithm missing its complexity target.
  Pass `&[T]` / `&str`; collect once at the end.
- `String` concatenation in a loop is O(n²); push into one `String` or a `Vec<u8>`.
- `format!` on a hot path allocates; write into a reusable buffer and clear it.
- Recursive DP that clones the memo key is usually a sign the state should be an index or a tuple of
  `Copy` values.

## Iterators versus indexing

- Indexing with `v[i]` checks bounds on every access; a `for` loop over `&v` or `&mut v` usually
  eliminates the check because the length is loop-invariant.
- `chunks_exact(k)` beats a manual `i += k` loop; `windows(k)` beats manual overlap indexing.
- `iter().zip(other)` removes parallel-index bugs entirely.
- `get_unchecked` is an `unsafe` promise you cannot break: hand it to `rust-unsafe` and prove the
  bound. Do not reach for it to "make it fast" without a measurement.

## Hashing and ordering choices

- `HashMap`'s default SipHash resists HashDoS but is slower than `FxHashMap`/`AHashMap`. Switch only
  when keys are not attacker-controlled; keep the default for request-derived keys.
- Iteration order of `HashMap` is unspecified: if output must be deterministic, sort or use
  `BTreeMap`/`IndexMap`.
- Custom `Hash` must agree with `Eq`: equal values must hash equal, or lookups silently miss.
- Custom `Ord` must be a total order and consistent with `Eq`; a comparator that returns `None`-ish
  behaviour or contradicts equality makes `sort`/`binary_search` results meaningless.

## Sorting and searching consistency

- `sort_unstable` is faster and allocates nothing, but reorders equal elements. If ties carry meaning,
  sort by the full key or use `sort`.
- `sort_unstable_by_key` recomputes the key many times. When the key is expensive, precompute pairs
  and sort those, or use `sort_unstable_by_cached_key`.
- `binary_search` requires the slice to be sorted by the **same** ordering used in the comparator. Mix
  `sort_by_key` with `binary_search_by(|x| x.field.cmp(&target))` and you will get false negatives.
- `partition_point` (first index where the predicate is false) replaces hand-written lower/upper-bound
  loops; use it for ranges of equal keys.

## Proving and measuring

- Write the brute-force version first: O(n²) or exhaustive, on small `n`. Then compare outputs with
  `proptest` — this catches the boundary cases humans forget (empty, singleton, duplicates, all
  equal, reverse sorted, maximum values).
- Test at the boundaries of the numeric type: `0`, `1`, `MAX`, and values that overflow when summed.
- Benchmarks: `criterion` + `std::hint::black_box` so the optimiser cannot delete the work; measure at
  the real target size, not at 100 elements.
- Parallel sorting (`rayon::par_sort_unstable`) changes tie order and can change floating-point
  reduction results; do not mix it into a determinism test without fixing the order.
