---
name: rust-mutability
description: Interior mutability in Rust — mutate behind `&self` with `Cell`, `RefCell`, `Mutex`/`RwLock` or `OnceLock`, and resolve `E0502`/`E0507` borrow conflicts without cloning or `unsafe`. Use when the user mentions `mut`, mutation, `Cell`, `RefCell`, `Mutex`, `RwLock`, `OnceLock`, interior mutability, `E0502`, `E0507`, borrow conflicts, or shared mutable state; or asks why a value cannot be borrowed as mutable, how to mutate through a shared reference, why a `RefCell` panicked at runtime, or who may write to a shared value.
---

# Interior Mutability

Interior mutability is a deliberate exception to the aliasing rule. **Leading word: alias** — the
only question worth asking is what else can reach this value while it changes. If the answer is
"nothing," you wanted `&mut`, not a cell.

## Route first

| Concern | Go to |
|---|---|
| Rule text for each cell type | `rust-skills` → `own-refcell-interior`, `own-mutex-interior`, `own-rwlock-readers`, `const-vs-static` |
| Rule text for `Arc`/`Rc` sharing and taking values | `rust-skills` → `own-arc-shared`, `own-rc-single-thread`, `mem-take-replace` |
| `&mut` would work if the mutation were sequenced | `rust-ownership` |
| Guard or borrow alive across `.await` | `rust-concurrency` (`async-no-lock-await`, `anti-lock-across-await`) |
| Lock-free counters, ordering, `loom` | `rust-concurrency` (`conc-atomic-ordering`) |
| `UnsafeCell`, manual `Sync`, hand-rolled lock | `rust-unsafe` |
| `Rc<RefCell<_>>` graph that outgrew its design | `rust-anti-pattern` |
| Move the check to compile time (typestate, `&mut` builders) | `rust-type-driven` |

## Playbook

1. **Exhaust `&mut` first.** Reorder so the mutation runs while the value is exclusively borrowed,
   or move the field into the function that mutates it. Done when no cell type was added.
2. **Pick the cell by the guarantee it must give, not by what compiles:**

   | Need | Type | What you pay |
   |---|---|---|
   | Copy/simple value through `&self`, one thread | `Cell<T>` | no borrows handed out, never panics |
   | Structured value through `&self`, one thread | `RefCell<T>` | runtime borrow flags, panics on conflict |
   | Any thread, structured writes | `Mutex<T>` / `RwLock<T>` | lock + poisoning, guard scoping |
   | Write once, read forever, no lock | `OnceLock<T>` / `LazyLock<T>` | init on first read |
   | One counter or flag | `Atomic*` | you must state the ordering |

   Done when you can name the row and the reason in one sentence.
3. **Wrap the smallest thing.** Put the cell around the field that changes, not around the struct.
   Done when the borrow or guard covers only the writes it performs.
4. **Never hold a borrow or guard across a call that can re-enter, panic or `.await`.** Copy the
   needed value out, drop the borrow, then call. Use `try_borrow*` where re-entry is reachable.
   Done when no `Ref` / `RefMut` / guard binding is alive at a callback or suspension point.
5. **`E0507` cannot move out of a shared reference.** Take the value (`mem::take`,
   `mem::replace`, `Option::take`, `.remove`) rather than cloning the container. Done when the
   source is left in a documented valid state (`Default` / `None` / empty).
6. **Poisoning is information.** A poisoned lock means a writer panicked mid-update: recover with
   `into_inner()` when the data is still coherent, propagate otherwise. Done when no
   non-test `lock()` result is `unwrap()`ed.

## Examples

```rust
use std::cell::Cell;

// A counter through &self: `&mut self` would force every reader to have exclusive access
struct Meter {
    hits: Cell<u64>,
}

impl Meter {
    fn hit(&self) {
        self.hits.set(self.hits.get() + 1);
    }
    fn hits(&self) -> u64 {
        self.hits.get()
    }
}
```

```rust
use std::cell::RefCell;

// Before: the shared borrow is still alive while the callback re-enters -> "already borrowed"
// fn notify(&self, f: impl Fn(&str)) {
//     let state = self.state.borrow();
//     f(&state.topic);
// }

// After: copy what the callback needs, release the borrow, then call it
fn notify(&self, f: impl Fn(&str)) {
    let topic = self.state.borrow().topic.clone();
    f(&topic);
}
```

```rust
use std::cell::RefCell;

// E0507: moving the handler out of a shared reference is illegal
// fn take(&self) -> Handler { self.handler }

struct Scheduler {
    handler: RefCell<Option<Handler>>,
}

impl Scheduler {
    fn take(&self) -> Option<Handler> {
        self.handler.borrow_mut().take()
    }
}
```

## Hard rules

- `&mut` first; a cell needs a reason exclusivity is impossible (shared ownership, `&self` trait
  method, callback re-entry) — "it compiled" is not a reason.
- The cell wraps one field, stays private, and its invariant is enforced by the methods around it.
- No borrow or guard survives a callback, a potential panic, or an `.await`.
- `RefCell` panics are not error handling: pick `try_borrow*` wherever a conflict is reachable.
- `Cell` / `RefCell` never cross a thread; if they must, the type changes — not the `impl`.

## Done when

- each cell in the diff matches a row of the table and names the invariant it protects
- no guard or borrow spans an `.await` or a re-entrant call
- `E0502` / `E0507` were resolved by restructuring or taking, not by cloning a container or `unsafe`
- `cargo check` passes with no added `unsafe impl Send` / `Sync`
