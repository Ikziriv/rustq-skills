---
name: rust-algorithms-upstream
description: Vendored reference implementations of 392 algorithms from TheAlgorithms/Rust, grouped by category (sorting, searching, graph, dynamic programming, strings, data structures, math, bit manipulation, ciphers and more). Use when you need to read or cite a concrete implementation of a named algorithm, want a reference to adapt, or when rust-algorithms points here for the source of an algorithm.
---

# Upstream implementations

**Leading word: source.** This skill is data, not instructions: the code lives in `src/` and is read,
cited and adapted — never pasted into a service.

- 421 `.rs` files, unmodified from [TheAlgorithms/Rust](https://github.com/TheAlgorithms/Rust).
- Pinned commit: `fed66cb0c74c4a939ec5163648458a8c2b46fd4c` (see `NOTICE.md`).
- MIT, © 2019 The Algorithms — see `LICENSE`.

## Layout

| Category | Path |
|---|---|
| Backtracking | `src/backtracking/` |
| Big integer | `src/big_integer/` |
| Bit manipulation | `src/bit_manipulation/` |
| Ciphers | `src/ciphers/` |
| Compression | `src/compression/` |
| Conversions | `src/conversions/` |
| Data structures | `src/data_structures/` |
| Dynamic programming | `src/dynamic_programming/` |
| Financial | `src/financial/` |
| General | `src/general/` |
| Geometry | `src/geometry/` |
| Graph | `src/graph/` |
| Greedy | `src/greedy/` |
| Hashing | `src/hashing/` |
| Machine learning | `src/machine_learning/` |
| Math | `src/math/` |
| Navigation | `src/navigation/` |
| Number theory | `src/number_theory/` |
| Searching | `src/searching/` |
| Signal analysis | `src/signal_analysis/` |
| Sorting | `src/sorting/` |
| String | `src/string/` |

## How to use

1. **Find the name.** `rust-algorithms` → `references/catalog.md` lists all 392 entries by category,
   each with the upstream path. Use it instead of guessing a filename.
2. **Open the file** at the category path above; each file is self-contained and small.
3. **Read the invariant** it assumes: sorted input, connected graph, non-negative weights, ASCII text,
   bounded `n`. Adapting without that invariant is how the port fails.
4. **Audit before adapting.** `rust-algorithms` → `references/implementations.md` has the table
   (panics, overflow, recursion depth, allocation, `unsafe`) and the category risk tiers.
5. **Keep vendored files intact.** Adapt in your own crate; do not edit `src/`.
6. **Refresh** with `node scripts/sync-algorithms-catalog.mjs` in the pack repo after upstream moves;
   re-vendor by copying the upstream `src/` tree and updating the commit in `NOTICE.md`.

## Hard rules

- Never paste a cipher, hash, PRNG or key-exchange file into a service: they are not constant-time and
  not AEAD/KDF designs. Use a maintained crate and say which one.
- Machine learning and financial files are teaching code; for real work use `linfa`/`candle`/`ndarray`
  and `Decimal` with an explicit rounding boundary.
- A file's name does not promise its complexity — `*_sort.rs` includes O(n²) teaching sorts by design.
- Upstream `#[cfg(test)]` tests show intent, not correctness; write your own adversarial cases.

## Done when

- the answer names the file it relied on, by path, and states the complexity and invariant
- any adaptation lists which audit items changed (panics, overflow, recursion, allocation)
- crypto, PRNG and ML questions route to a crate rather than to a vendored file
