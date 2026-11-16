# Choosing by cost

One table per family. Read the constraint column first; the answer follows from it.

## Sorting

| Constraint | Use | Cost | Note |
|---|---|---|---|
| Default | `slice::sort_unstable` | O(n log n) | pattern-defeating quicksort; no allocation |
| Stability required | `slice::sort` | O(n log n) | TimSort-style; allocates |
| Total order is expensive | `sort_unstable_by_key` | O(n log n) | key computed repeatedly on unstable sort — cache it if costly |
| Small integer keys, bounded range | counting sort | O(n + k) | `k` must be small; build counts with `vec![0; k]` |
| Fixed-width integer/float keys | radix sort | O(d·n) | stable variant when you need tie order |
| Nearly sorted, cheap comparisons | insertion sort | O(n + inversions) | best real-world "already ordered" case |
| Streaming / does not fit memory | external merge | O(n log n) I/O | sort runs, then k-way merge with a heap |
| Adversarial comparator input | merge sort or pdqsort | O(n log n) worst | quicksort with a bad pivot degrades to O(n²) |

Floats: sort with `total_cmp`, never `partial_cmp().unwrap()`.

## Searching and selection

| Constraint | Use | Cost |
|---|---|---|
| Unsorted, one query | linear scan | O(n) |
| Sorted, membership | `binary_search` / `binary_search_by` | O(log n) |
| Monotonic predicate, first true | `partition_point` | O(log n) |
| k-th smallest, one query | `select_nth_unstable` | O(n) expected |
| k-th smallest, many queries | sort once | O(n log n) + O(1) |
| Top-k from a stream | `BinaryHeap` of size k | O(n log k) |
| Uniformly distributed numeric keys | interpolation search | O(log log n) average, O(n) worst |
| 2-D matrix sorted by rows and columns | saddleback search | O(rows + cols) |
| Real-valued unimodal function | ternary search | O(log range) |

## Data structures — std first

| Need | Type | Cost |
|---|---|---|
| Sequence, push/pop at end | `Vec<T>` | O(1) amortised |
| FIFO / both ends | `VecDeque<T>` | O(1) amortised |
| Max / min repeatedly | `BinaryHeap<T>` | O(log n) push/pop |
| Ordered map / range queries | `BTreeMap<K, V>` | O(log n) |
| Ordered set, predecessors | `BTreeSet<T>` | O(log n) |
| Unordered map, fast average | `HashMap<K, V>` | O(1) average |
| Insertion order preserved | `IndexMap` (crate) | O(1) average |
| Priority + decrease-key | indexed heap / `BinaryHeap` + lazy deletion | O(log n) |
| Union / connectivity | DSU (union-find) with path halving + union by size | O(α(n)) |
| Prefix sums with point updates | Fenwick tree | O(log n) |
| Range query + range update | segment tree (lazy) | O(log n) |
| String prefix | trie / `BTreeMap<Vec<u8>, _>` | O(key length) |
| Membership with false positives allowed | Bloom filter | O(k) |

`LinkedList` is almost never the answer: no cache locality, no O(1) arbitrary access, and a worse
constant factor than `Vec` for every linear operation.

## Graphs

Representation: adjacency list `Vec<Vec<usize>>` (or `Vec<Vec<(usize, W)>>`) for sparse; dense matrix
`Vec<Vec<W>>`; CSR (`offsets` + `targets`) when the graph is built once and traversed hot.

| Question | Algorithm | Cost |
|---|---|---|
| Reachability, unweighted shortest path | BFS | O(V + E) |
| Components, cycle detection (directed), order | DFS | O(V + E) |
| Dependency order | topological sort (Kahn or DFS post-order) | O(V + E) |
| Non-negative weights | Dijkstra with `BinaryHeap` | O(E log V) |
| Negative weights | Bellman-Ford | O(V·E) |
| Negative weights + negative cycle detection | Bellman-Ford / SPFA | O(V·E) |
| All pairs, dense | Floyd-Warshall | O(V³) |
| Heuristic shortest path, admissible h | A* | O(E log V), data-dependent |
| MST | Kruskal (DSU) or Prim (dense) | O(E log E) / O(V²) |
| Strongly connected components | Tarjan or Kosaraju | O(V + E) |
| Bridges / articulation points | DFS lowlink | O(V + E) |
| Max flow | Dinic | O(V²E) general, better in practice |
| Bipartite matching | Hopcroft-Karp | O(E√V) |
| Cheapest connection in a metric | Prim + heap | O(E log V) |

Negative edge + a shortest path is never Dijkstra. Bounded edge weights (small integers) sometimes
beat a heap: Dial's algorithm with a bucket queue is O(E + W·V).

## Strings

| Need | Use | Cost |
|---|---|---|
| One pattern, one text | `str::find` (`memchr`-accelerated for single bytes) | O(n·m) worst, fast in practice |
| Many patterns at once | Aho-Corasick | O(n + matches) |
| Pattern with self-overlap, streaming | KMP | O(n + m) |
| Many queries of one pattern | Z-function / prefix function | O(n + m) build |
| Longest repeated substring, suffixes | suffix array (+ LCP) | O(n log n) build |
| Edit distance / fuzzy match | Levenshtein / Damerau-Levenshtein with a rolling row | O(n·m) time, O(min(n, m)) space |
| Similarity score for names | Jaro-Winkler | O(n·m) |
| Longest palindromic substring | Manacher | O(n) |
| Prefix search / autocomplete | trie | O(key length) |
| Compress repeated runs | run-length encoding | O(n) |

Bytes vs chars: index `&str` only through char boundaries (`char_indices`, `chars`). Byte-oriented
algorithms are correct on UTF-8 only when the pattern is ASCII or you operate on `&[u8]`.

## Dynamic programming

Recognise it by two properties: **optimal substructure** and **overlapping subproblems**. If the
subproblems never repeat, it is divide and conquer, not DP.

| Shape | State | Typical problems |
|---|---|---|
| Linear | `dp[i]` = best ending/using `i` | LIS, max subarray, house robber, word break |
| Prefix pair | `dp[i][j]` over two sequences | LCS, edit distance, wildcard matching |
| Interval | `dp[l][r]` | matrix chain, optimal BST, palindrome partitioning |
| Knapsack | `dp[i][w]` capacity | 0/1, unbounded, subset sum, coin change |
| Grid | `dp[r][c]` | grid paths, min cost path, maximal square |
| Bitmask | `dp[mask]` over subsets | TSP, assignment, set cover (`n ≤ 20`) |
| Digit | position + tight + started | counting numbers with a property |
| Tree | per-node aggregate | tree DP, rerooting |

Space: keep only the previous row/column when transitions look back one step (`O(min(n, m))`).
Reconstruction needs the full table or a parent pointer — decide before optimising memory away.

## Math, number theory, bits

| Need | Use | Cost |
|---|---|---|
| gcd / lcm | Euclid (`u64::gcd`), `lcm` via `a / gcd * b` | O(log min) |
| Modular inverse | extended Euclid or Fermat (prime modulus) | O(log m) |
| Modular power | binary exponentiation | O(log e) |
| Primes to n | sieve of Eratosthenes / linear sieve | O(n log log n) / O(n) |
| Primality of one large number | Miller-Rabin (deterministic bases for u64) | O(k log³ n) |
| Factorise | trial division to √n, then Pollard's rho | O(√n) / sub-exponential |
| Binomials mod p | factorials + inverse factorials | O(n) build, O(1) query |
| Bit count / position | `count_ones`, `trailing_zeros`, `leading_zeros`, `rotate_left` | O(1) |
| Lowest set bit | `x & x.wrapping_neg()` | O(1) |
| Subset enumeration | `for s in 0..(1 << n)` or `s = (s - 1) & mask` | O(2ⁿ) |

Overflow is a correctness bug, not a style issue: multiply `u64` moduli in `u128`, and prefer
`checked_*` in index math.

## Backtracking

Use when the search space is combinatorial and pruning is real. Order candidates to fail fast, carry
the state by value where cheap (`u64` bitmask instead of `HashSet`), and undo incrementally rather
than cloning the candidate.

Rule of thumb: if the pruning condition cannot be written as a bound on the remaining search, the
"backtracking" is just brute force with extra steps.

## Complexity rules of thumb

| n | Budget | Feasible |
|---|---|---|
| 10⁶ | ~1 s | O(n), O(n log n) |
| 10⁵ | ~1 s | O(n log n), O(n√n) with a small constant |
| 10⁴ | ~1 s | O(n²) |
| 10³ | ~1 s | O(n² log n), O(n³) if tight |
| 20–24 | ~1 s | O(2ⁿ) bitmask DP |
| 10–12 | ~1 s | O(n!) with pruning |

These assume simple operations in a tight loop; always confirm with a benchmark at the real size.
