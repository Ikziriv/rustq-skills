# Memory Safety Decision Tree

Walk these questions in order when ownership, lifetimes, interior mutability, `unsafe`, or a
borrow-checker error is in play. Each answer names the `rust-skills` rule to read for the full
example — the rules are the source of truth; this file is the routing.

## 1. Who needs access to this value?

| Need | Reach for | Rule |
|---|---|---|
| One owner, read-only borrows | plain `&T` / `&mut T` | `own-borrow-over-clone` |
| Shared, single-threaded | `Rc<T>`; add `RefCell<T>` for interior mutation | `own-rc-single-thread`, `own-refcell-interior` |
| Shared across threads | `Arc<T>` + `Mutex`/`RwLock` | `own-arc-shared`, `own-mutex-interior`, `own-rwlock-readers` |
| Conditional ownership | `Cow<'a, T>` | `own-cow-conditional` |
| Move a value out of `&mut` without cloning | `mem::take` / `mem::replace` | `mem-take-replace` |

## 2. What do I take as a function argument?

- Slices, not vecs: `&[T]`, not `&Vec<T>` (`own-slice-over-vec`).
- Strings: `&str`, not `&String` (`anti-string-for-str`).
- If you only read, take `&T` / `AsRef<T>` (`api-impl-asref`).
- Small cheap types → implement `Copy` (`own-copy-small`); large types → move, `Box` if moves
  are expensive (`own-move-large`).

## 3. Lifetimes — add them only when required

Rely on elision; name lifetimes only when the compiler asks or the relationship is non-obvious
(`own-lifetime-elision`, `name-lifetime-short`). When the borrow checker rejects a design that
is actually sound, the answer is usually to restructure ownership, not to reach for `unsafe`.

## 4. Interior mutability — escape hatch, not default

Only when the type system cannot express the mutation pattern safely: single-thread →
`RefCell`; cross-thread → `Mutex`/`RwLock`. Never wrap a value you could instead own and pass
by `&mut`.

## 5. `unsafe` — last resort, justified

Before writing `unsafe`, ask whether safe Rust or an audited crate (e.g. `crossbeam`) already
expresses it. If it must be unsafe:

- Smallest possible block, `// SAFETY:` comment above it, `# Safety` section on any
  `unsafe fn` (`unsafe-safety-comment`, `unsafe-minimize-scope`).
- `MaybeUninit<T>` for uninitialized memory; never `mem::zeroed()` on types with validity
  invariants (`unsafe-maybeuninit`).
- Run `cargo miri test` in CI (`unsafe-miri-ci`).

## Rust 2024 notes

`extern` blocks are `unsafe extern { }` with per-item `safe`/`unsafe` (`unsafe-extern-block`);
`#[unsafe(no_mangle)]`, `#[unsafe(export_name = "...")]`, `#[unsafe(link_section = "...")]`
(`unsafe-no-mangle-unsafe`).
