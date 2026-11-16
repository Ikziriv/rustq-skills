# Using the vendored implementations

The `rust-algorithms-upstream` sibling skill contains **421 unmodified `.rs` files** from
[TheAlgorithms/Rust](https://github.com/TheAlgorithms/Rust) at commit
`fed66cb0c74c4a939ec5163648458a8c2b46fd4c` (MIT; its `LICENSE` and `NOTICE.md` record provenance).

They are **teaching implementations**: written for readability, not for production. Treat each file as
a specification you can read, not as code you can paste.

## Audit before you adapt

| Check | What to look for | Fix |
|---|---|---|
| Complexity | Deliberately naive variants (bubble sort, naive substring search) | Keep only if `n` is small and stated |
| Panics | `unwrap()`, `expect()`, `panic!`, direct indexing | Return `Result`/`Option`; use `get` |
| Overflow | `+`/`*` on index or accumulator math, `as` casts | `checked_*`, `try_into`, widen to `u128` |
| Recursion | DFS, backtracking, divide and conquer | Convert to an explicit stack when depth is data-driven |
| Allocation | `clone()` per iteration, `format!` in loops, `Rc<RefCell<_>>` graphs | Borrow, reuse buffers, index-based graphs |
| Edge cases | Empty input, one element, duplicates, negative numbers, Unicode | Add the test before the port |
| API shape | Free functions, concrete types, no docs | Wrap in your domain types; add `# Errors` |
| `unsafe` | Raw pointers, `get_unchecked` | Route through `rust-unsafe` before keeping it |

Many files carry their own `#[cfg(test)]` tests. They are a hint about intent, not proof of
correctness: they usually cover the happy path the author had in mind.

## Category risk tiers

| Tier | Categories | How to use |
|---|---|---|
| **Reference-grade** | Sorting, Searching, Data Structures, Graph, Greedy, Backtracking, Dynamic Programming, String, Geometry, Math, Number Theory, Bit Manipulation, Big Integer, Conversions, Compression, Navigation | Read, audit, adapt. Complexity and edge cases are the risks, not safety. |
| **Educational only — security** | Ciphers, Hashing | Do **not** ship. These are not constant-time and are not AEAD/KDF designs. Use `aes-gcm`, `chacha20poly1305`, `argon2`, `sha2`, `blake2`, `rustls`. |
| **Educational only — domain** | Machine Learning, Financial, Signal Analysis | Use a maintained crate (`linfa`, `candle`, `ndarray`) and, for money, `Decimal` with an explicit rounding boundary. |

A working RSA or MD5 implementation is still the wrong thing to deploy: the risk is side channels and
protocol misuse, which the algorithm text does not address.

## Porting procedure

1. **Pin the contract.** Write the constraint and target complexity *before* opening the file.
2. **Read the whole file.** Note the invariant it relies on (sorted input, connected graph, ASCII
   input, non-negative weights).
3. **Write the failing test first.** Include the adversarial cases your data can produce.
4. **Port with the audit table above.** Change the signature to your types; remove panics; make the
   invariant explicit in a comment or a type.
5. **Compare against the original** on small random inputs (`proptest` or a brute force).
6. **Benchmark at the target size.** If the ported version misses the cost, the algorithm choice is
   wrong — go back to `selection.md`, not to micro-optimisation.

```rust
// Upstream shape: panics on a missing key and on overflow
// fn total(map: &HashMap<u8, u32>) -> u32 { map.values().sum::<u32>() * 2 }

// Ported: explicit failure, no overflow, no panic
fn total(map: &HashMap<u8, u32>) -> Result<u32, TotalError> {
    map.values()
        .try_fold(0u32, |acc, &v| acc.checked_add(v))
        .and_then(|sum| sum.checked_mul(2))
        .ok_or(TotalError::Overflow)
}
```

## Do not

- Copy a cipher, hash, PRNG or key-exchange file into a service.
- Copy an `unsafe` block without a `// SAFETY:` argument (`rust-unsafe`).
- Assume the file's complexity from its name — `*_sort.rs` includes O(n²) teaching sorts by design.
- Paste a `main`/demo harness into library code.
