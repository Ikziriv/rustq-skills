---
name: rust-const
description: Const and compile-time Rust — move invariants into const evaluation, choose between const, static and const generics, and assert layout at build time. Use when the user mentions `const fn`, `const` generics, `const { }` blocks, `static`, `OnceLock`, compile-time assertions, or `const` versus `static`; or asks how to fail the build on a bad constant, how to size a buffer in the type, or how to initialise global state without `static mut`.
---

# Const & Compile-Time Evaluation

A `const` context is code the compiler runs for you, once, before the program exists. **Leading
word: evaluation.** The interesting decision is not "can this be const" but "which of these values
must be known at build time, and which may be computed at first use".

## Route first

| Concern | Go to |
|---|---|
| Rule text (`const-fn`, `const-vs-static`, `const-block`, `const-generics`, `mem-assert-type-size`, `proj-msrv-declare`) | `rust-skills` |
| Whole-crate workflow, feature and MSRV policy | `rust-skill` |
| Global mutable state through a pointer or `static mut` | `rust-unsafe` |
| Encoding the invariant as a type instead of an assertion | `rust-type-driven` |
| Generating code instead of computing values | `rust-macro` |
| Ownership of the static's contents | `rust-ownership` |
| A size or count that must match an FFI struct | `rust-ffi` |

## Playbook

1. **Classify the value.** Inlined at each use with no address → `const`. One instance with an
   address, possibly initialised lazily → `static` (+ `OnceLock`, `LazyLock`, `Mutex`). A family
   differing only by a size or small integer → const generic. Done when each item is
   `const`, `static`, or a const parameter, and none is `static mut`.
2. **Make the constructor `const fn`.** Pure, no heap, no dynamic dispatch, no trait objects
   (`const-fn`). Done when the constructor is usable in a `const` item.
3. **Push the invariant into the build.** `const _: () = assert!(...)` for layout and range checks,
   `const { }` to force evaluation at a specific point and scope (`const-block`,
   `mem-assert-type-size`). Done when an invalid configuration fails `cargo check`, not a test.
4. **Replace runtime lengths with const generics.** `Buf<const N: usize>` instead of
   `struct Buf { data: Vec<u8> }` plus a capacity check (`const-generics`). Done when the bound is
   in the type and the runtime capacity check is gone.
5. **Initialise globals without `unsafe`.** `OnceLock::get_or_init` for derived values, `Atomic*`
   for counters and flags, `thread_local!` for per-thread state. Done when the only global mutation
   goes through an atomic or a lock.
6. **Check the MSRV.** Const capabilities and const-stability of `std` APIs vary by release; verify
   against the declared MSRV rather than the local toolchain (`proj-msrv-declare`). Done when a
   build on the MSRV toolchain passes.

## Examples

```rust
use std::mem::size_of;

// Fails the build, with this message, the moment the layout drifts.
const _: () = assert!(size_of::<Header>() == 16, "Header must stay 16 bytes");

#[repr(C)]
struct Header { magic: u32, version: u16, flags: u16, len: u64 }
```

```rust
pub struct Cents(i64);

impl Cents {
    // const fn may branch and panic, so the check runs at compile time for constants
    // and at runtime for values that genuinely arrive at runtime.
    pub const fn new(value: i64) -> Self {
        assert!(value >= 0, "Cents must be non-negative");
        Self(value)
    }

    pub const fn get(self) -> i64 {
        self.0
    }
}

const PRICE: Cents = Cents::new(1999); // rejected at compile time if the literal goes negative
```

```rust
pub struct FixedBuf<const N: usize> { data: [u8; N], len: usize }

impl<const N: usize> FixedBuf<N> {
    pub const fn new() -> Self { Self { data: [0; N], len: 0 } }
    pub const fn capacity(&self) -> usize { N } // capacity is a type parameter, not a field
}

// One address, built at compile time; mutation would go through a lock, never `static mut`.
static EMPTY_TEMPLATE: FixedBuf<64> = FixedBuf::new();
```

## Hard rules

- A `const` is inlined at every use and has no identity; if you need one address, a `Drop`, or
  interior mutability, it is a `static`.
- `static mut` is never the answer: use `Atomic*`, `Mutex`, `OnceLock`, or `thread_local!`.
- A `const fn` has no heap and no dynamic dispatch; when a capability is not const-stable, take the
  runtime path instead of an `unsafe` shortcut.
- Compile-time failure is for values known at build time; do not contort a config file or an
  environment variable into a `const`.
- Layout and range invariants go in `const _: () = assert!(...)` so a type change fails the build.

## Done when

- an invalid configuration fails `cargo check`, proven by a `trybuild` or commented negative case
- no `static mut` and no `unsafe` in global initialisation
- every `const fn` is exercised from a `const` item, so its const-ness is real
- the declared MSRV toolchain builds the crate with the const features used
