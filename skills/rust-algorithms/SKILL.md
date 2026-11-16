---
name: rust-algorithms
description: Pick and implement algorithms and data structures in Rust by cost rather than by name — sorting, searching, graphs, dynamic programming, strings, math, number theory, backtracking and bit tricks, with std-first choices, complexity trade-offs and Rust-specific pitfalls (overflow, float ordering, recursion depth, graph representation). Use when the user mentions algorithm, data structure, complexity, big-O, sorting, binary search, BFS, DFS, Dijkstra, DP, memoization, KMP, trie, or asks which algorithm to use, why a solution is too slow, or how to implement one idiomatically.
---

# Algorithms & Data Structures

**Leading word: cost.** You are not picking the algorithm with the best name — you are picking the
one whose cost fits the constraints you were given. State the constraint, then the cost, then the code.

Every algorithm in [TheAlgorithms/Rust](https://github.com/TheAlgorithms/Rust) is indexed in
[references/catalog.md](references/catalog.md) (392 entries, 23 categories, linked to source).

## Route first

| Concern | Go to |
|---|---|
| Rule text for iterators, memory, numeric safety | `rust-skills` → `perf-iter-over-index`, `mem-with-capacity`, `num-overflow-explicit`, `num-float-compare` |
| The workflow around the code | `rust-skill` |
| Measuring instead of asserting | `rust-performance` |
| Parallel data algorithms (sorting, folds) | `rust-concurrency` |
| `unsafe` inner loop, unchecked indexing | `rust-unsafe` |
| Pinning down correctness with brute-force oracles | `rust-testing` |
| Hashing choice, DoS resistance | `rust-skills` → `perf-ahash`, `coll-map-choice` |
| Graph persisted in a database, not memory | `rust-database` |

## Playbook

1. **Write the constraints down.** Input size `n`, value ranges, memory budget, stability, ordering,
   online vs offline, single-thread vs parallel. *Done when* the chosen complexity target is written
   next to the algorithm (e.g. "n ≤ 2e5, O(n log n), stable").
2. **Check stdin/stdlib first.** `sort_unstable_by_key`, `binary_search_by`, `partition_point`,
   `select_nth_unstable`, `BTreeMap`, `BinaryHeap`, `VecDeque`, `HashMap::entry`, `slice::windows`,
   `chunks_exact`. Hand-rolling one of these is a defect unless the constraint demands it.
   *Done when* the code contains no re-implementation of a std primitive.
3. **Choose the family by cost, not by familiarity.** Use [references/selection.md](references/selection.md)
   for the sort/search/structure/graph/string/DP decision tables and their complexity.
   *Done when* the trade-off you rejected is named (e.g. "Dijkstra, not Bellman-Ford: no negative
   edges").
4. **Pick a representation that survives the borrow checker.** Indices, not references; adjacency
   lists as `Vec<Vec<usize>>` or CSR, not `Rc<RefCell<Node>>`. *Done when* no algorithm needs a
   mutable aliasing workaround.
5. **Respect Rust's arithmetic and ordering rules.** Use `checked_*`/`wrapping_*`/`saturating_*`
   deliberately, `total_cmp` for floats, and `usize`-safe subtraction. Read
   [references/rust-pitfalls.md](references/rust-pitfalls.md).
6. **Prove it against a brute force.** On small `n`, compare with the obvious O(n²) or exhaustive
   version under `proptest`. *Done when* a property test covers the boundary cases (empty, one
   element, duplicates, all-equal, sorted, reverse-sorted).
7. **Measure at the target size.** Criterion benchmark with `black_box`, and record the observed
   complexity. *Done when* the benchmark exists and matches the promised cost.

## Cost cheat sheet

| Problem | Default | Cost | Use instead when |
|---|---|---|---|
| Sort | `sort_unstable` | O(n log n) | stable order matters → `sort`; integer keys → counting/radix |
| Search sorted | `binary_search_by` | O(log n) | predicate flips once → `partition_point` |
| k-th element | `select_nth_unstable` | O(n) avg | repeated queries → sort once or a heap |
| Top-k stream | `BinaryHeap` | O(n log k) | k large → sort; f64 keys → `total_cmp` |
| Membership | `HashSet` | O(1) avg | ordered iteration → `BTreeSet`; DoS input → default hasher |
| FIFO / LIFO | `VecDeque` / `Vec` | O(1) amortised | priority order → `BinaryHeap` |
| Prefix sums | `Vec` scan | O(n) build, O(1) query | updates → Fenwick/segment tree |
| Shortest path | BFS (unweighted) / Dijkstra | O(V+E) / O(E log V) | negative edges → Bellman-Ford; all pairs → Floyd-Warshall |
| Substring | `str::find` | implementation-defined | many patterns → Aho-Corasick; repeated → KMP/Z |
| Overlapping subproblems | DP table | states × transitions | no overlap → divide and conquer |

## References

- **`references/catalog.md`** — all 392 upstream algorithms, grouped by category and linked to
  upstream source. Read it to find the name of the thing you half-remember.
- **`references/implementations.md`** — how to adapt reference code: the audit table (panics,
  overflow, recursion, allocation), category risk tiers, and the porting procedure.
- **`rust-algorithms-upstream`** (sibling skill) — the 421 unmodified upstream `.rs` files, under
  `src/<category>/`. Read them; do not paste them.
- **`references/selection.md`** — decision tables and complexity for sorting, searching, structures,
  graphs, strings, DP, math and bit manipulation.
- **`references/rust-pitfalls.md`** — overflow, float ordering, recursion depth, graph
  representation, allocation and hashing failure modes.

## Hard rules

- No algorithm without a stated complexity and the input size it was chosen for.
- Std first: a hand-written sort, binary search or queue must justify itself.
- No `as` casts and no unchecked arithmetic in index or accumulator math on data paths.
- No recursion on input-controlled depth; convert to an explicit stack.
- Vendored upstream code is reference, not production: audit panics, overflow and complexity, and
  never ship its cipher, hash, PRNG or ML files.
- No performance claim without a benchmark at the target `n` and a brute-force correctness oracle.

## Done when

- the constraint, the chosen complexity and the rejected alternative are all written down
- a property or brute-force test covers empty, singleton, duplicate and adversarial inputs
- a benchmark at the target size shows the promised cost, and the code has no avoidable allocation
