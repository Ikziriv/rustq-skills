---
name: rust-lifetime-complex
description: Advanced lifetime work in Rust — read the "one type is more general" error, write HRTB and GAT bounds, state dyn-object and 'static bounds honestly, and track variance and borrows across await. Use when the user mentions HRTB, GATs, `for<'a>`, `'static`, `dyn Trait + 'a`, variance, covariance, or a borrow held across `.await`; or asks why a closure is "not general enough", how to return a borrowing iterator, or why `Box<dyn Trait>` demands `'static`.
---

# Complex Lifetimes

A lifetime is a constraint between two borrows, so a signature that will not type-check is usually
one where the constraint is wrong upstream. **Leading word: variance.** Subtyping, HRTB and GATs are
all the same question: which lifetime may be substituted for which, and who gets to choose it.

## Route first

| Concern | Go to |
|---|---|
| Rule text (`own-lifetime-elision`, `name-lifetime-short`, `closure-static-vs-dyn`, `trait-object-safety`, `async-clone-before-await`) | `rust-skills` |
| Whole-function workflow, signature design | `rust-skill` |
| Lifetimes reached through a raw pointer or `transmute` | `rust-unsafe` |
| Plain `E0382`/`E0515` borrowing, no trait involved | `rust-ownership` |
| Self-referential value, `Pin<&mut T>` | `rust-pin` |
| Spawned future needs `'static` | `rust-async-pattern` |
| Variance of a marker type, newtype wrappers | `rust-type-driven` |
| Lifetime inside an FFI signature | `rust-ffi` |

## Playbook

1. **Find the binding that dies first.** Reduce to the smallest example, then name the value whose
   scope is shorter than required. Done when you can point at the `let` that ends too early.
2. **Elide, then name once.** Add `'a` only where two positions must be tied, and name it for its
   source (`'input`, `'cfg`). Done when every explicit lifetime appears at least twice.
3. **`E0597`/`E0521` — shorten or own.** Move the last use earlier, take ownership, or borrow from
   a longer-lived owner; `Cow<'_, str>` when the callee sometimes owns. Done when the fix is not a
   `'static` bound.
4. **`'static` in return position is a claim.** `T: 'static` means "holds no borrows", not "lives
   forever", so adding it pushes the requirement onto the caller. Done when the caller can pass a
   borrowed value, or the documentation says it cannot.
5. **State the object's borrow.** `Box<dyn Trait>` is `+ 'static` by default; write `Box<dyn Trait +
   'a>` when it borrows, and `dyn Trait` inside a borrowing struct needs `+ 'a`. Done when no
   `'static` bound appears that the data does not satisfy.
6. **HRTB when the relation must hold for every lifetime.** `for<'a> Fn(&'a T) -> &'a U`, not a
   single inferred `'a`. "One type is more general" means a closure was inferred for one lifetime:
   pass a fn item or annotate the closure. Done when the bound is `for<'a>` and the call site
   compiles without a cast.
7. **GATs need `where Self: 'a`.** Write the clause in the definition *and* the impl; that clause
   is what makes the lending pattern expressible without `unsafe`. Done when the impl compiles with
   no `unsafe` block.
8. **Borrow across `.await`.** A reference live at a suspension point is part of the future's type;
   compute first, then await, or move the value in. Done when no borrowed local spans an `.await`
   unless the future is deliberately borrowing.

## Examples

```rust
// The bound must hold for *every* lifetime; an inferred single one produces
// "one type is more general than the other".
fn call_twice<F>(f: F) -> (String, String)
where
    F: for<'a> Fn(&'a str) -> &'a str,
{
    (f("alpha").to_owned(), f("beta").to_owned())
}

fn identity(s: &str) -> &str { s } // fn item: general over every lifetime

fn demo() -> (String, String) {
    call_twice(identity)
}
```

```rust
trait Lender {
    type Item<'a> where Self: 'a; // the clause is mandatory, here and in the impl

    fn next(&mut self) -> Option<Self::Item<'_>>;
}

struct Windows<'v> { data: &'v [u8], at: usize }

impl<'v> Lender for Windows<'v> {
    type Item<'a> = &'a [u8] where Self: 'a;

    fn next(&mut self) -> Option<Self::Item<'_>> {
        let data = self.data; // `&'v [u8]` is Copy: the borrow of `self` ends on this line
        if self.at >= data.len() {
            return None;
        }
        let end = (self.at + 2).min(data.len());
        let window = &data[self.at..end];
        self.at += 1;
        Some(window)
    }
}
```

```rust
// Edition 2024: return-position `impl Trait` captures every in-scope lifetime, so the returned
// iterator would appear to borrow `cfg`. `use<>` says it captures nothing.
fn owned_range(cfg: &Config) -> impl Iterator<Item = u32> + use<> {
    let limit = cfg.limit;
    (0..limit).map(|i| i * 2)
}
```

## Hard rules

- A lifetime annotation never extends a value's life; if the data dies too early, own it or
  restructure — do not annotate harder.
- `'static` is "contains no borrows", so adding it moves the obligation to the caller; never add it
  to silence the checker.
- Every explicit lifetime appears at least twice and names its source; anonymous `'_` where the
  relation is obvious.
- `Box<dyn Trait>` is `+ 'static`; a borrowing trait object states `+ 'a` in the signature.
- A borrow live across `.await` is part of the future's type: compute, then await.

## Done when

- the minimal reproduction compiles by changing ownership, not by adding annotations
- no `'static` bound exists that a borrowed value could not satisfy, verified by passing one in a
  test
- `cargo check` is clean with elision wherever elision suffices
- every HRTB and GAT carries its `for<'a>` / `where Self: 'a` clause, with no `unsafe`
