---
name: rust-ownership
description: Ownership, borrowing and lifetimes in Rust — decide who owns a value, borrow instead of cloning, and fix `E0382`, `E0506` and `E0515` by moving the ownership boundary rather than silencing the checker. Use when the user mentions ownership, borrow, the borrow checker, lifetimes, moves, `E0382`, `E0506`, `E0515`, `&str` vs `String`, or returning references; or asks why a value was moved, how to return a reference from a function, how long a borrow lives, or whether a `struct` should hold `&T` or own its data.
---

# Ownership & Lifetimes

Who owns each value, who borrows it, and for how long — that is the entire decision. **Leading
word: borrow.** No lifetime annotation fixes a signature that assigns ownership to the wrong side;
change the signature instead.

## Route first

| Concern | Go to |
|---|---|
| The workflow for the whole function or module | `rust-skill` |
| Rule text for borrowing, slices, cloning | `rust-skills` → `own-borrow-over-clone`, `own-slice-over-vec`, `anti-string-for-str`, `anti-vec-for-slice` |
| Rule text for elision, naming, `mem::take` | `rust-skills` → `own-lifetime-elision`, `name-lifetime-short`, `mem-take-replace` |
| Value crosses a thread or task boundary | `rust-concurrency` |
| Mutate through `&self`; `E0502` / `E0507` | `rust-mutability` |
| Lifetimes multiplying across traits, `impl`s, returned iterators | `rust-lifetime-complex` |
| Self-referential struct, future that borrows its own state | `rust-pin` |
| Clones showing up in a profile | `rust-performance` |
| Reference derived from a raw pointer | `rust-unsafe` |

## Playbook

1. **Name the owner.** For every parameter and return, write one of: caller keeps it (`&T`,
   `&mut T`), callee takes it (`T`), or it is shared (`Rc<T>`, `Arc<T>`). Done when each one is
   classified and no `&String` / `&Vec<T>` appears where `&str` / `&[T]` would do.
2. **`E0382` use of moved value.** Decide which use is the owner, then make the other use borrow
   or move the consuming use earlier. Done when the fix contains no `.clone()` added only to
   quiet the checker.
3. **`E0515` returns a reference to a local.** Return owned data, borrow from an input, or return
   a handle/index/`impl Iterator` over an input. Done when no returned reference resolves to a
   local binding.
4. **`E0506` assign while borrowed.** End the borrow first — `mem::take`, `mem::replace`,
   `Option::take`, `.remove` — or shorten its scope. Done when the assignment happens after the
   last use of the old borrow.
5. **Elision first, annotations second.** Add `'a` only when two inputs compete for the output or
   a struct stores a reference; name it for its source (`'input`, `'cfg`). Done when every
   explicit lifetime appears in at least two positions and names a real relationship.
6. **Should the struct borrow?** If the struct outlives the source (config, cache entry, event),
   own the data or use `Cow<'_, str>`. Done when no type is parameterised by a lifetime it uses
   only to look cheap.

## Examples

```rust
// Before: allocates a String to hand back a field that is already a &str
fn email(user: &User) -> String {
    user.email.clone()
}

// After: one input reference — elision gives the output that lifetime, zero allocation
fn email(user: &User) -> &str {
    &user.email
}
```

```rust
// Before: E0515 — the returned slice refers to a local that is dropped at the end of the call
// fn label() -> &str { &format!("v{}", 3) }

// After: return the owned value; readers that only inspect it can borrow from the caller's copy
fn label(version: u32) -> String {
    format!("v{version}")
}
```

```rust
// Before: E0506 — assigning through a borrow that is still live
// fn reset(&mut self) {
//     let name = &self.name;
//     self.name = String::new();   // error: cannot assign because it is borrowed
//     log(name);
// }

// After: take the value out, so the borrow dies with the statement (`mem-take-replace`)
fn reset(&mut self) {
    let name = std::mem::take(&mut self.name);
    log(&name);
}
```

## Hard rules

- Fix `E0382` / `E0506` / `E0515` at the ownership boundary; a `.clone()` that only silences the
  checker is a defect, not a fix.
- No function returns a reference to a local — borrow from an input or return owned data.
- Parameters borrow wide (`&str`, `&[T]`, `impl AsRef<Path>`); return owned unless the output is
  derived from an input.
- A lifetime annotation never extends a value's life. If the data dies too early, own it or move
  it — never annotate harder.
- If a borrow must outlive its owner, the data is owned or `Cow<'_, str>`; nothing else.

## Done when

- `cargo check` is clean and the diff adds no clone or annotation purely to appease the checker
- every public signature takes `&str` / `&[T]` where it does not need ownership
- no returned reference names a local, and no struct lifetime outlives its source
- every explicit lifetime appears in at least two positions
