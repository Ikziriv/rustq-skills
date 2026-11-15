---
name: rust-pin
description: Pin and self-referential types in Rust — decide whether a value may move, pin it once at the right scope, and project the pin safely instead of reaching for `get_unchecked_mut`. Use when the user mentions `Pin`, `Unpin`, `PhantomPinned`, pin projection, or polling a future by hand; or asks why an `async fn` future cannot be polled from `&mut`, how to store a pointer to your own field, or how to write a `!Unpin` type without making it unsound.
---

# Pin & Self-Referential Types

`Pin` is a promise about an **address**, not a container: it says the value will not move before it
is dropped. **Leading word: address.** `Unpin` is the opt-out that says "mine can move anyway", and
almost every type is `Unpin` for free.

## Route first

| Concern | Go to |
|---|---|
| Rule text (`type-phantom-marker`, `type-repr-transparent`, `async-fn-in-trait`, `trait-object-safety`) | `rust-skills` |
| Whole-function or whole-crate workflow | `rust-skill` |
| Hand-written projection, `get_unchecked_mut`, self-referential `unsafe` | `rust-unsafe` |
| Who owns the value and the borrow it pins | `rust-ownership` |
| Future not `Send` or borrow held across `.await` | `rust-lifetime-complex` |
| Task holds the pinned future across spawn | `rust-async-pattern` |
| Stream / `select!` polling of the pinned future | `rust-async` |
| Marker type is carrying the pinning invariant | `rust-type-driven` |

## Playbook

1. **Justify the pin.** Name either a self-reference (a field holds a pointer into the same value)
   or a foreign API that demands `Pin` (an `async fn` future, `Future::poll`). Done when you can
   write the sentence "this value must not move because …" without mentioning the borrow checker.
2. **Prefer `Unpin`.** Leave the default and pass `&mut T`. Done when the type has no self-pointer
   and no `PhantomPinned` field.
3. **Pin at the narrowest scope that suffices.** `pin!` on the stack for one function body,
   `Box::pin` for a value that outlives the frame or crosses into a task, `Arc::pin` when it is
   also shared. Done when the value is moved only before the pin and the pin handle lives as long
   as the value is used.
4. **Project with a crate, not by hand.** `pin-project-lite` for structs, `pin-project` for enums
   and generic-heavy types. Done when each structurally pinned field is marked `#[pin]` and no
   `get_unchecked_mut` appears in your code.
5. **Respect the projection contract in `Drop`.** A `Drop` impl on a pinned type may not move a
   structurally pinned field out: use `ManuallyDrop::take` or `ptr::drop_in_place`. Done when
   dropping the value with its self-reference still live leaves no dangling use.
6. **Check it under Miri.** Any hand-written projection or self-reference runs `cargo miri test`.
   Done when Miri reports no stacked-borrows or use-after-free on the pinning paths.

## Examples

```rust
use std::future::Future;
use std::pin::{pin, Pin};

// An `async fn` future is `!Unpin`, so a generic helper must take `Pin<&mut F>`.
fn keep_pinned<F: Future>(fut: Pin<&mut F>) -> Pin<&mut F> {
    fut
}

async fn run() -> u32 {
    let fut = async { 1 + 1 };
    let mut fut = pin!(fut); // fixed on the stack; no allocation, cannot move after this line
    keep_pinned(fut.as_mut()).await
}
```

```rust
use std::marker::PhantomPinned;
use std::pin::Pin;

/// Registered by address elsewhere: moving it would invalidate that registration.
pub struct Registered {
    id: u32,
    _pin: PhantomPinned,
}

impl Registered {
    fn bump(self: Pin<&mut Self>) {
        // SAFETY: `Registered` holds no self-reference and `id` is not structurally pinned; we
        // mutate one field and never move the value out of the pinned place.
        let this = unsafe { self.get_unchecked_mut() };
        this.id += 1;
    }
}
```

```rust
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Instant;

pin_project_lite::pin_project! {
    pub struct Deadline<F> {
        #[pin] inner: F,     // polled in place: the pin is forwarded, not dropped
        deadline: Instant,   // never pinned: handed out as `&mut`
    }
}

impl<F: Future> Future for Deadline<F> {
    type Output = Option<F::Output>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.project();
        if Instant::now() >= *this.deadline {
            return Poll::Ready(None);
        }
        this.inner.poll(cx).map(Some)
    }
}
```

## Hard rules

- Never move out of a `Pin<&mut T>` — no `mem::replace`, `mem::take`, `*pinned = new`, no
  destructuring — unless `T: Unpin` or you are inside `Drop` via `ManuallyDrop`.
- `Pin` guarantees nothing on its own; `!Unpin` plus a held pin handle is what forbids the move.
- Never `impl Unpin` for a self-referential type; `PhantomPinned` is the opt-out and it is a field,
  not a comment.
- A `#[pin]` field is a contract: `Drop` may not move it and no `&mut` to it may escape.
- A bare `&mut F` poll is only valid for `F: Unpin`; everything else takes `Pin<&mut F>`.

## Done when

- every pin has a written reason, and the value is moved only before the pin is created
- no `get_unchecked_mut` without a `// SAFETY:` naming structural pinning, and Miri is green on
  the pinning paths
- a `!Unpin` type drops cleanly while its self-reference is still live
- no `#[pin]` field is moved out of in `Drop`
