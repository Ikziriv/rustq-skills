# Unsafe contracts, by operation

Each row is the contract for one call. The **obligation** column is what the caller must guarantee;
the **UB if broken** column is what the compiler is allowed to do to you. Cite the obligation in the
`// SAFETY:` comment.

## Raw pointers and slices

| Operation | Obligation | UB if broken |
|---|---|---|
| Deref `*ptr` | Non-null, aligned for `T`, points into a live allocation, initialized, no conflicting access for the duration | UAF, misalignment, uninit read, aliasing |
| `slice::from_raw_parts(p, len)` | Non-null, aligned, `len * size_of::<T>()` bytes initialized and in one allocation, total ≤ `isize::MAX`, no mutation for `'a` | UAF, uninit read, aliasing |
| `from_raw_parts_mut(p, len)` | As above, plus no reader or writer for `'a` | Aliasing |
| `offset` / `add` / `sub` | Result stays in the allocation or one past its end; never deref one-past | Out-of-bounds provenance |
| `ptr::read` | Valid for reads, aligned, initialized; the source is not used again unless `T: Copy` | Double drop, UAF |
| `ptr::write` | Aligned, valid for writes; the previous value is not dropped (leak unless handled) | Uninit/double free |
| `ptr::copy` / `copy_nonoverlapping` | Read- and write-valid for `count`, aligned; `dst` and `src` do not overlap (nonoverlapping only) | Corruption, double drop |
| `get_unchecked` / `_mut` | Index `< len`; the slice is live | OOB read/write |
| `NonNull::as_ref` / `as_mut` | Pointer was non-null and valid at construction and still is | UAF, aliasing |

A pointer that came from an integer has no provenance. `ptr::without_provenance` /
`expose_provenance` exist so the intent is explicit; casting an address into a pointer and
dereferencing it is UB.

## Memory and initialization

| Operation | Obligation | UB if broken |
|---|---|---|
| `MaybeUninit::assume_init` | Every byte the type reads is initialized | Uninit read |
| `Vec::set_len(n)` | `n <= capacity`; elements `0..n` initialized | Uninit read, double drop |
| `Vec::from_raw_parts(p, len, cap)` | `p` came from this allocator with that exact `Layout`, `len <= cap`, elements initialized | Invalid dealloc, uninit read |
| `String::from_raw_parts` | As `Vec`, plus valid UTF-8 | Invalid `str` |
| `from_utf8_unchecked` | The bytes are valid UTF-8 | Invalid `str` |
| `mem::transmute::<A, B>` | `size_of::<A>() == size_of::<B>()`; every bit pattern of `A` is a valid `B` | Invalid value |
| `transmute_copy::<A, B>` | `size_of::<B>() <= size_of::<A>()` and the same validity rule | OOB read, invalid value |
| Drop in `Drop::drop` | The value is never read again; use `ptr::drop_in_place` for owned heap data | Double drop |
| Deallocating | Same `Layout` as the allocation, from the same allocator | Invalid dealloc |

Reading padding is reading uninitialized memory. Do not compare or hash a struct byte-wise unless
it is `#[repr(C)]` with no padding, or every field is initialized and you use a typed path.

## Types and layout

| Operation | Obligation | UB if broken |
|---|---|---|
| `union` field read | The bit pattern is valid for that field's type | Invalid value |
| `#[repr(Rust)]` FFI struct | None — the layout is unspecified; use `#[repr(C)]` or `#[repr(transparent)]` | ABI mismatch, field reorder |
| `UnsafeCell` access | No `&mut` to the contents exists while any `&` to them exists | Aliasing |
| `PhantomData<fn() -> T>` vs `PhantomData<T>` | The variance and auto-trait consequences are intentional | Variance hole, false `Send` |
| `unsafe impl Send` / `Sync` | Every field and every operation on the type is safe to move/share across threads | Data race |

## Concurrency

| Operation | Obligation | UB if broken |
|---|---|---|
| `Atomic*::load`/`store`/RMW | The `Ordering` is strong enough for the invariant it publishes or consumes | Data race (weaker than `Relaxed` is still a race only if non-atomic) |
| `static mut` | There is exactly one access at a time, by any thread | Data race |
| Manual lock | Every read and write happens under the lock, including the writes that publish | Data race |
| `thread::spawn` closure | Everything it captures is `Send` and does not borrow non-`'static` data | UAF |
| `scope` borrow | The borrow ends before the scope returns | UAF |

`Ordering::Relaxed` is not "no synchronization is needed"; it orders atomics, not surrounding
memory. The usual rule: `Acquire` on load, `Release` on store, `AcqRel` on RMW, `SeqCst` only when
you cannot show a happens-before edge without it.

## FFI and unwinding

| Operation | Obligation | UB if broken |
|---|---|---|
| `extern "C"` call | Types match the foreign ABI exactly; no `bool`, no Rust `enum` without `#[repr]`, no `String`/`Vec` by value | ABI mismatch, invalid value |
| Panic across `extern "C"` | The foreign side never observes a Rust unwind; use `extern "C-unwind"` if it must | Unwinding across a non-unwind ABI |
| `#[unsafe(no_mangle)]` / `export_name` | The symbol is unique and the signature is the one the foreign caller uses | Symbol clash, ABI mismatch |
| Callback from foreign code | The foreign side may call at any time, including during a panic | Re-entrancy, aliasing |
| Void pointer round-trip | The allocation is still owned by exactly one side | Double free |

In Rust 2024 `extern` blocks are `unsafe extern`, and each item is annotated `safe` or `unsafe`.
Unannotated items are `unsafe` to use — that is the intended friction.

## UB catalogue

| Class | Typical trigger |
|---|---|
| Use after free | `Box`/`Vec` freed while a raw pointer or `&'static` outlives it |
| Double free / double drop | `ptr::read` + both values dropped, `set_len` over initialized elements |
| Invalid value | `transmute` into `bool`/`char`/`NonZero`/enum; `assume_init` of a partially written struct |
| Misalignment | Casting `*const u8` to `*const u64` without aligning, or reading a packed field by reference |
| Aliasing violation | `&mut` and `&` to the same bytes; `UnsafeCell` bypassed |
| Data race | Two threads, one write, no atomics or lock |
| Uninitialized read | Reading `MaybeUninit` or padding before writing |
| Out-of-bounds provenance | `offset` past the allocation, then deref |
| Invalid dealloc | Layout mismatch, or memory freed by the wrong allocator |
| Unwinding across FFI | `panic!` in a `extern "C"` function |

## What the tools do and do not prove

| Tool | Catches | Misses |
|---|---|---|
| `cargo miri test` | UB in executed code: UAF, uninit, alignment, aliasing (Stacked/Tree Borrows), provenance | Real FFI calls, inline asm, some SIMD, weak-memory effects |
| `cargo test --release` | UB that only misbehaves after optimization | Anything the optimizer happened to leave alone |
| AddressSanitizer | Heap/stack overflow, UAF on real allocations | Aliasing, uninit reads, invalid values |
| ThreadSanitizer | Data races | Aliasing, lifetime bugs |
| `loom` | Interleavings of your synchronization code | Anything outside the modelled primitives |
| `cargo clippy` | Missing `// SAFETY:` (`undocumented_unsafe_blocks`), some `fn` signature mistakes | Whether the contract is *true* |

No tool proves soundness. A green Miri run plus a written contract per site is the strongest
evidence you can get cheaply; say so in the report instead of claiming proof.
