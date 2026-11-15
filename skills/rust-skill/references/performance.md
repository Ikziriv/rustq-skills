# Rust Performance & Memory

## Zero-cost mindset

- Prefer stack allocation and value semantics. `Vec`/`String` heap-allocate; `[T; N]`, tuples, and `Option<T>` (sized `T` stores inline) do not.
- Iterators compile to tight loops — use them. Avoid `.collect::<Vec<_>>()` then re-iterating; chain and fuse instead.
- `Box<dyn Trait>` = heap + vtable dispatch. Prefer generics (`impl Trait`) so monomorphization inlines the call.

## Measure before optimizing

1. Profile: `perf` (Linux), `Instruments` (macOS), or `cargo-flamegraph`. Find the hot function.
2. Benchmark: `criterion` for micro, `hyperfine` for binaries. Capture before/after.
3. Optimize only the measured hot path; leave the rest idiomatic.

## Match the cost to the fix

| Cost seen in the profile | Fix |
|---|---|
| Allocation churn | `with_capacity`, reuse buffers, arena, `SmallVec`/`ArrayVec` |
| Repeated cloning | borrow, `clone_from`, `Cow` |
| Iterator/collect overhead | stay lazy, `collect_into`, avoid intermediate collects |
| Bounds checks | iterators and patterns the compiler can elide |
| Cold/error paths inlined | `#[cold]`/`#[inline(never)]`; `#[inline]` small hot fns |
| DoS-resistant hashing unneeded | `ahash`/`FxHashMap` |
| Many small I/O ops | `BufReader`/`BufWriter` |

## Parallelism

- CPU-bound data parallelism → `rayon::par_iter`; portable SIMD for vectorized ops. Never `spawn` + `Mutex` where an iterator splits work cleanly.

## Allocation & layout

- Reduce allocations: reuse buffers (`String::clear`, `Vec::clear`), use `with_capacity` when the size is known, prefer `extend`/`write!` over `+`/`format!` in loops.
- `format!` allocates on every call — avoid in hot loops; use `write!` into a pre-allocated `String`.
- Prefer `&str`/`&[T]` slices; `Cow<'_, str>` when you must sometimes own.
- `#[repr(C)]` for FFI/interop; `#[repr(packed)]`/`align` only when you understand the cost (unaligned reads).
- `Box<[T]>` instead of `Vec<T>` for a sized-once, never-growing slice (one word smaller).

## Avoiding copies

- Pass `&T` instead of `T`; return `T` and let the caller decide to clone.
- Use `.iter()` (borrow, no move) vs `.into_iter()` (move) deliberately.
- `Clone` only at true ownership boundaries; audit `.clone()` in loops.

## Hashing & collections

- Choose by access pattern: `HashMap`/`HashSet` (random access), `BTreeMap`/`BTreeSet` (ordered/range), `Vec` (small N — linear scan beats hashing under ~50 elements).
- Swap the hasher for numeric keys (`rustc-hash`/`FxHashMap`) when keys are small ints and DoS-resistance is not required.

## Strings & parsing

- `&str` slicing is `O(1)` but panics on non-char-boundary — use `.get(..)` for checked slicing.
- Prefer `char_indices()`/`split`/`find` over `to_string()` + regex when the pattern is simple.
- Avoid repeated `to_string()`; build strings with `String` + `write!`/`push_str`.

## Concurrency overhead

- `std::sync::Mutex` is fine for short critical sections; `parking_lot::Mutex` lowers contention overhead; `RwLock` for read-mostly; atomics for single-word state.
- Don't `Arc<Mutex<T>>` a value only one task touches — scope the sharing.
- In async, hold locks only across non-`.await` code; `.await` inside a lock = deadlock/congestion risk.

## Unsafe & SIMD (only when measured)

- Enable target features (`-C target-cpu=native`) for SIMD auto-vectorization before hand-writing intrinsics.
- Hand-rolled `unsafe`/SIMD is justified only when a profiler proves the safe version is the bottleneck.

## Compiler flags & size

- Release speed: `[profile.release] opt-level = 3, lto = true, codegen-units = 1, panic = "abort"` (drop `panic=abort` if you rely on unwind).
- Binary size: `strip`, `lto = "fat"`, `opt-level = "z"` (or `"s"`), `panic = "abort"`, and `cargo-bloat` to find the culprit.
