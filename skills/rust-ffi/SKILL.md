---
name: rust-ffi
description: Cross-language interop for Rust — fix the layout, the ownership handoff and the error convention at every C, C++ or Python edge, then prove it from the foreign side. Use when the user mentions FFI, bindgen, cbindgen, cxx, PyO3, `extern "C"`, `#[repr(C)]`, ABI, opaque handles, or calling C from Rust; or asks how to expose a Rust type to C, how to stop a panic crossing the boundary, or who frees a pointer allocated on the other side.
---

# FFI & Cross-Language Interop

Each edge needs three agreements: the **layout** of the bytes, who **owns** each value, and how a
failure travels back. **Leading word: boundary.** The Rust compiler checks none of it across the
line, so every edge carries a written contract or a latent bug.

## Route first

| Concern | Go to |
|---|---|
| Rule text (`unsafe-extern-block`, `unsafe-no-mangle-unsafe`, `type-repr-transparent`, `proj-build-rs-minimal`) | `rust-skills` |
| Whole-crate workflow, build script, module layout | `rust-skill` |
| Soundness of the `unsafe` sites and the safe wrapper around them | `rust-unsafe` |
| Who owns the handle; `Arc` on the boundary | `rust-ownership` |
| Mapping foreign status codes onto a typed error | `rust-error` |
| Callback signatures, `for<'a>` bounds, lifetimes in `extern fn` | `rust-lifetime-complex` |
| Opaque-handle newtype, ownership marker | `rust-type-driven` |
| The boundary is JS/TS rather than C | `rust-wasm-js-interop` |

## Playbook

1. **One tool per edge.** Rust exports to C → `cbindgen` over `#[repr(C)]` types. C consumed by
   Rust → `bindgen` in `build.rs`. C++ either way → a `cxx::bridge`. Python → PyO3. Done when each
   edge has one generator and its output is a build artifact, never hand-edited.
2. **Fix the layout.** `#[repr(C)]` on every struct that crosses, `#[repr(transparent)]` on
   newtypes over C scalars, `#[repr(C)]` or an opaque `Box<T>` pointer for enums and handles. Done
   when no crossing signature mentions `String`, `Vec<T>`, `&dyn Trait`, or an unrepresented enum.
3. **Write the ownership table.** For each pointer: who allocates, which function frees, whether
   the callee may keep it after return. Done when every allocation has exactly one free function
   and it lives in the crate that owns that allocator.
4. **Fix the error convention.** A status enum plus an out-param, or `cxx`'s `Result`; never a
   sentinel value sharing a range with real data. Done when the foreign side can tell "ok", "bad
   input" and "internal failure" apart without reading Rust source.
5. **Contain unwinding.** `catch_unwind` in every `extern "C"` entry point; no Rust panic into C
   or C++ (`extern "C"` frames abort on unwind), and no C++ exception through a Rust frame.
   Done when an injected panic becomes a status code instead of aborting the process.
6. **Prove it from the foreign side.** Build the C/C++ consumer against the generated header, run
   it under ASan/UBSan, and run `cargo miri test` for the Rust-side wrapper logic (Miri cannot
   cross the boundary). Done when the consumer's open/use/free test is green under a sanitizer.

## Examples

```rust
use std::panic::catch_unwind;

pub struct Db { name: Vec<u8> }

#[unsafe(no_mangle)]
pub extern "C" fn db_open() -> *mut Db {
    Box::into_raw(Box::new(Db { name: Vec::new() }))
}

/// # Safety
/// `db` must come from `db_open` and must not be used again afterwards.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn db_free(db: *mut Db) {
    if !db.is_null() {
        // SAFETY: allocated by `db_open` with `Box::into_raw`; freed at most once per contract.
        drop(unsafe { Box::from_raw(db) });
    }
}

/// # Safety
/// `db` must be null or a live pointer returned by `db_open`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn db_len(db: *const Db) -> usize {
    // A panic must never unwind into the caller's language.
    catch_unwind(|| {
        // SAFETY: non-null per the contract above; the pointee is live.
        unsafe { db.as_ref() }.map_or(0, |db| db.name.len())
    })
    .unwrap_or(0)
}
```

```rust
// C++ owned by Rust: layout from the header, exception surfaced as `Err`, no ABI guesswork.
#[cxx::bridge]
mod ffi {
    unsafe extern "C++" {
        include!("blobstore.h");
        type BlobStore;
        fn get(self: &BlobStore, key: &str) -> Result<String>;
    }
}
```

```rust
use pyo3::prelude::*;

#[pyclass] struct Counter { seen: u64 }

#[pymethods]
impl Counter {
    #[new]
    fn new() -> Self { Self { seen: 0 } }
    fn bump(&mut self) -> u64 { self.seen += 1; self.seen }
}
```

## Hard rules

- Only `#[repr(C)]` / `#[repr(transparent)]` types and raw pointers cross a C ABI — a `String`,
  `Vec`, `Box`, `&dyn Trait` or bare `bool`-layout struct is a silent memory-safety hole.
- Free what you allocated: `malloc` memory is not freed by `Box::from_raw`, and `Box::into_raw`
  memory is not freed by `free`.
- Nothing unwinds across the boundary in either direction; `catch_unwind` is mandatory on the Rust
  entry points, and `panic = "abort"` builds change the failure mode, not the rule.
- Generated bindings are build artifacts: regenerate, and keep the generator in `build.rs`
  (`proj-build-rs-minimal`).
- Every `unsafe` call names validity, alignment, lifetime and ownership in one `// SAFETY:`
  sentence; `rust-unsafe` reviews it.

## Done when

- each edge lists one generator, one crate owning each allocation, and one free function
- the foreign-language test calls open/use/free and passes under ASan/UBSan
- a forced panic in an entry point returns an error value and the process survives
- `cargo miri test` is green for the Rust-side wrapper logic, and no panic path crosses the line
