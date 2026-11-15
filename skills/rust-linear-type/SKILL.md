---
name: rust-linear-type
description: Must-consume protocols in Rust — approximate linear types with consuming methods, private fields and typestate, knowing the compiler only warns and never enforces. Use when the user mentions linear types, affine types, must-consume, must-use, Destructible, RAII, resource protocol, prevent drop, typestate completion, ManuallyDrop, or asks how to force a value to be closed, stop a handle being dropped silently, or whether Rust can reject a leaked value at compile time.
---

# Must-Consume Protocols

Rust is **affine**, not linear: a value may be dropped implicitly, `mem::forget`-ed or leaked, so
"used exactly once" is not a property the compiler can check. **Leading word: consume.** What you can
build is a type whose only graceful exit consumes it; the rest is privacy, warnings and review.

The mechanics of release — drop order, fallible cleanup, cancellation — belong to `rust-resource`.
This skill is about the edge of what the compiler can promise, and how far to push it.

## Route first

| Concern | Go to |
|---|---|
| Rule text: `#[must_use]`, typestate, enum states, private fields | `rust-skills` → `api-must-use`, `api-builder-must-use`, `api-typestate`, `type-enum-states`, `type-newtype-validated`, `mem-take-replace`, `mem-drop-order` |
| The workflow for the type being written | `rust-skill` |
| RAII, drop order, fallible close, leaks, cancellation | `rust-resource` |
| Protocol states and invariants as types, parse-don't-validate | `rust-type-driven` |
| Who moves the value, borrow vs take, lifetimes | `rust-ownership` |
| `Option::take`, `Cell`, mutating through `&self` | `rust-mutability` |
| The error a `close` returns and its `From` impls | `rust-error` |
| Compile-fail tests and CI lint gates | `rust-testing` |
| Counting backstop hits in production | `rust-observability` |

## Playbook

1. **Price the failure before paying for the type.** Silent drop of a file handle or a lock: use RAII
   and move on. Silent drop of an uncommitted payment, an unrecorded audit entry, a half-finished
   migration: encode the protocol. *Done when* you can name the concrete bug the type prevents.
2. **Close the constructors.** Private fields, no `Clone`, no `Copy`, no `Default`, one acquiring
   constructor. *Done when* no code outside the module can build a second value from the first.
3. **Give it exactly one graceful exit.** `fn close(self) -> Result<(), E>` — or `commit`, `finish`,
   `seal` — takes the resource by value. *Done when* every success path ends in that call and review
   can see the ones that do not.
4. **Demote `Drop` to a backstop.** `Option<Inner>` taken by both `close` and `drop`; the backstop
   logs, never fails, never propagates. *Done when* double release is impossible and the backstop is
   reachable only by abandonment or panic.
5. **Encode the protocol as states.** Each transition consumes `self` and returns the next state, and
   intermediate states have no other exit. *Done when* skipping a step is a type error, not a runtime
   check.
6. **Add the enforcement Rust does not give you.** `#[must_use]` on the type and on every transition,
   `#![deny(unused_must_use)]`, clippy's `must_use_candidate`, and a CI grep for `let _ =` on handles.
   *Done when* dropping a required value fails the build, not just the review.
7. **Account for the escape hatches.** `ManuallyDrop` means you call `drop_in_place` or you leak;
   `mem::forget` and `Box::leak` are deliberate leaks; `Rc` cycles never drop. *Done when* every use
   carries a written reason and a named owner for the memory.

## Examples

```rust
pub struct Transaction {
    inner: Option<RawTx>, // private: nothing outside can read, rebuild or clone the handle
}

impl Transaction {
    /// The only graceful exit: consumes the handle, so the caller cannot use it again,
    /// and returns the commit error instead of swallowing it the way `Drop` must.
    pub fn commit(mut self) -> Result<(), CommitError> {
        let raw = self.inner.take().ok_or(CommitError::AlreadyClosed)?;
        raw.commit()
    }
}

impl Drop for Transaction {
    fn drop(&mut self) {
        if let Some(raw) = self.inner.take() {
            raw.rollback(); // backstop only: cannot fail, cannot report, cannot be prevented
        }
    }
}
```

```rust
// Two states, one consuming transition: an unsigned record cannot be filed.
#[must_use = "an unsigned record is discarded work; call `.sign(key)`"]
pub struct Unsigned(Vec<u8>);
pub struct Signed(SignedBytes);

impl Unsigned {
    pub fn sign(self, key: &SigningKey) -> Signed {
        Signed(key.sign(&self.0))
    }
}

impl Signed {
    pub fn ledger_id(&self) -> LedgerId { LedgerId::of(&self.0) }
    // No `sign` here, and no conversion back to `Unsigned`: signing happens exactly once.
}
```

## Hard rules

- Rust has no linear types and no `Destructible` bound: `Drop`, `mem::forget` and `Box::leak` dispose
  of any value, so "cannot be dropped" is a guarantee you cannot make — do not claim it.
- `#[must_use]` is a warning; `deny(unused_must_use)` in CI is the closest thing to enforcement.
- Privacy, no `Clone`, one consuming exit is the entire mechanism; a `pub` field or one derive undoes it.
- `Drop` cannot fail and cannot be prevented; it is a backstop, never the graceful path.
- Pay for typestate only where misuse is expensive and the protocol is short.

## Done when

- no `Clone`/`Copy`/`Default`, no public field, and one constructor per protocol type
- every graceful exit consumes `self` and returns `Result`; the backstop only logs
- dropping a required value fails CI through `deny(unused_must_use)` and clippy, not only review
- a compile-fail test shows the skipped step or the second use is rejected
