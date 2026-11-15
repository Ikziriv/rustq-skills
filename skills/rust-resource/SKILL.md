---
name: rust-resource
description: Own and release resources deterministically in Rust — RAII as the default, drop order, fallible cleanup outside `Drop`, cancellation, and leak accounting. Use when the user mentions RAII, `Drop`, resource leak, file handle, socket, cleanup, guard, defer, cancellation cleanup, double close, `mem::forget` or `ManuallyDrop`, or asks why a handle is still open, what order destructors run in, or how to flush before the function returns.
---

# Resource Ownership & Cleanup

A resource is anything someone else counts: a file descriptor, socket, connection, transaction, lock,
temp file, child process. **Leading word: owner.** One type owns each handle, `Drop` releases it, and
the release happens on every exit path — `?`, early `return`, `break`, panic unwinding. What `Drop`
cannot do is report a failure or survive cancellation, and those two gaps are where the leaks live.

## Route first

| Concern | Go to |
|---|---|
| Rule text: drop order, take/replace, guards, cancel safety | `rust-skills` → `mem-drop-order`, `mem-take-replace`, `api-must-use`, `anti-lock-across-await`, `async-cancel-safety`, `test-fixture-raii` |
| The workflow for the code being written | `rust-skill` |
| Cancellation, `select!`, futures dropped mid-flight | `rust-async` |
| Lock poisoning, a guard held across a panic | `rust-mutability` |
| Pools, connections, transactions, migrations | `rust-database` |
| Error from a closing call, retrying a failed commit | `rust-error` |
| Handle or RSS growth in a running service | `rust-performance` |
| Manual drop, `ptr::drop_in_place`, FFI-owned handles | `rust-unsafe` |
| Fixtures that must clean up after a failing assert | `rust-testing` |
| Blocking work that keeps a handle open | `rust-concurrency` |

## Playbook

1. **Name the resource and its single owner.** One type owns one handle; no two values may release
   the same one. *Done when* ownership of every fd, socket, connection and lock appears exactly once
   in a type signature.
2. **Let RAII do the release.** `Drop` runs on `?`, `return`, `break` and unwind, so no call site
   needs a manual close to avoid a leak. *Done when* deleting every manual `close()` still frees every
   handle and loses only the error detail.
3. **Order the drops.** Struct fields drop in declaration order, locals in reverse. A guard must be
   declared *before* the resource it guards, so it drops *after* it; a lock guard dropped during
   unwinding poisons the mutex, which is a release path with a visible cost. *Done when* declaration
   order in each struct is the required release order, and commented where it is not obvious.
4. **Move fallible cleanup out of `Drop`.** `fsync`, `shutdown`, `close` (which reports), `commit`:
   expose `close(self) -> Result<(), E>` that consumes the handle, and keep `Drop` as a backstop that
   `take`s the inner handle so a double release cannot happen. *Done when* the success path calls the
   explicit close and only the backstop is silent.
5. **Treat cancellation as an exit path.** Dropping a future releases whatever it held at that
   arbitrary point — not at a clean boundary. Anything live across `.await` must be releasable there,
   or owned by a guard that the canceller also drops, or closed through a shutdown token.
   *Done when* every `.await` that holds a transaction, lock or half-written buffer is labelled
   cancel-safe or restructured.
6. **Account for intentional leaks.** `mem::forget`, `ManuallyDrop`, `Box::leak` and `Rc`/`Arc` cycles
   leak by design (`own-arc-shared`); the cycle fix is `Weak` or an ownership redesign, not a bigger
   refcount. *Done when* each occurrence is `'static` process-lifetime data or carries a written reason.
7. **Test the error path, not the happy one.** Loop the operation, force a failure between acquire
   and release, and watch fd count and RSS. *Done when* both the success and the failing loop return
   those counters to baseline.

## Examples

```rust
pub struct Connection {
    // `Option` so the explicit close can take the handle; `Drop` then has nothing left to release.
    inner: Option<RawConn>,
}

impl Connection {
    /// Consumes the handle: the wire's error reaches the caller instead of being
    /// swallowed by `Drop`, and the handle cannot be closed twice.
    pub fn close(mut self) -> io::Result<()> {
        match self.inner.take() {
            Some(raw) => raw.shutdown(), // fsync / FIN / COMMIT — fallible, so it is explicit
            None => Ok(()),
        }
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        if let Some(raw) = self.inner.take() {
            // Best-effort backstop: `Drop` cannot return, so an error is logged, never propagated.
            if let Err(err) = raw.shutdown() {
                eprintln!("connection shutdown failed during drop: {err}");
            }
        }
    }
}
```

```rust
use std::fs::File;
use std::io::{self, Write};
use std::path::Path;
use std::sync::Mutex;

// `guard` is declared first, so it drops last: the lock outlives the write and the fsync.
fn snapshot(state: &Mutex<Vec<u8>>, path: &Path) -> io::Result<()> {
    let guard = state.lock().unwrap();
    let mut file = File::create(path)?; // declared second, closed before the lock is released
    file.write_all(&guard)?;
    file.sync_all()?; // explicit: `File`'s drop ignores this error entirely
    Ok(())
}
```

## Hard rules

- One owner per handle; the type that owns it releases it, and no path releases it twice.
- Cleanup that can fail never lives only in `Drop` — expose a consuming close and leave `Drop` silent.
- Drop order is part of the type: fields in release order, guards declared before what they guard.
- Dropping a future is cancellation, not shutdown; nothing held across `.await` gets a graceful exit.
- `mem::forget`, `ManuallyDrop`, `Box::leak` and reference cycles are leaks by design — process-lifetime only.

## Done when

- every handle type has one owner, one release path, and an explicit fallible close where release can report
- no guard is dropped before the resource it protects, and field order encodes the release order
- a looped test forces the error path and returns fd count and RSS to baseline
- every intentional leak names its lifetime and its reason
