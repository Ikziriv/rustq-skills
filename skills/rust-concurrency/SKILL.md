---
name: rust-concurrency
description: Concurrency and async in Rust — choose between scoped threads, rayon, tokio tasks and channels, then make the choice hold under `Send`/`Sync`, bounded fan-out and cancellation. Use when the user mentions threads, `spawn`, `async`/`await`, tokio, `Send`, `Sync`, channels, rayon, parallelism, deadlock, or atomics; or asks to run work in parallel, share state between tasks, fix a hang or a stalled runtime, or move blocking code off an async worker.
---

# Concurrency & Async

Only three questions matter: who runs this, how much of it runs at once, and what happens when it
is interrupted. **Leading word: race.** Every design here is an answer to "what can touch this
simultaneously, and who waits."

## Route first

| Concern | Go to |
|---|---|
| Rule text (`conc-*`, `async-*`, `anti-lock-across-await`) | `rust-skills` |
| Service architecture, runtime setup, axum/tokio wiring | `rust-skill` → `references/backend.md` |
| The data behind the lock (`Cell`, `Mutex`, `OnceLock`, atomics) | `rust-mutability` |
| Future will not compile: `!Send`, borrow across `.await`, opaque lifetime | `rust-pin`, `rust-lifetime-complex` |
| Hand-rolled synchronization, memory model, `loom` | `rust-unsafe` (`test-loom-concurrency`) |
| Throughput or latency of the parallel code | `rust-performance` |
| `JoinError`, retries, errors inside tasks | `rust-error` |
| Handlers, load shedding, backpressure at the edge | `rust-web` |

## Playbook

1. **Name the executor and the work class.** CPU-bound independent items → rayon; CPU-bound
   inside async → `spawn_blocking`; IO-bound → tokio tasks; evolving shared state → one owning
   task plus channels. Done when each path fits one of those five and nothing blocking runs on a
   runtime worker.
2. **Put a number on in-flight work.** `buffer_unordered(n)`, `Semaphore`, a bounded channel, or
   chunking. Done when every fan-out site has a literal bound instead of a bare `spawn` in a loop.
3. **Choose sharing by the reader/writer pattern.** Read-only slice → borrow it (scoped threads,
   rayon); set once then read → `OnceLock` / `Arc<T>`; increments → an atomic with stated
   ordering; read-mostly struct → `RwLock`; anything else → send a message to the owner. Done
   when each shared value has exactly one writer path.
4. **Treat `Send`/`Sync` errors as design feedback.** The offending value (guard, `Rc`, `RefCell`
   borrow) is dropped before the `.await`, moved inside the task, or the task runs on a
   single-threaded runtime. Done when no `unsafe impl Send` was added and the value's scope ends
   before the suspension point.
5. **Make cancellation a state machine.** Decide what a dropped future leaves behind; only use
   cancel-safe operations inside `select!`; long work takes a `CancellationToken` and checks it.
   Done when dropping the future at any `.await` leaves the system consistent.
6. **Use the weakest correct ordering.** `Relaxed` for counters, `Acquire`/`Release` for
   publishing data, `SeqCst` only when you cannot state the edge. Done when each atomic has a
   one-line comment naming the happens-before edge it establishes.

## Examples

```rust
use rayon::prelude::*;

// CPU-bound over a borrowed slice: rayon owns the fan-out, no Arc, no lock, no clone
fn total_cents(lines: &[Line]) -> u64 {
    lines.par_iter().map(Line::cents).sum()
}
```

```rust
use futures::{StreamExt, TryStreamExt, stream};

// Before: one task per id, unbounded, failures dropped with the JoinHandle
// for id in ids { tokio::spawn(fetch(id)); }

// After: bounded fan-out, results collected in completion order, error propagated
async fn fetch_all(ids: &[Id]) -> Result<Vec<Body>, FetchError> {
    stream::iter(ids.iter().copied())
        .map(|id| async move { fetch(id).await })
        .buffer_unordered(8)
        .try_collect()
        .await
}
```

```rust
// Before: a std guard is !Send and is still held when the task suspends -> does not compile
// let mut guard = state.lock().map_err(|_| Error::Poisoned)?;
// guard.value = fetch().await?;

// After: await first, take the lock only for the write
let value = fetch().await?;
state.lock().map_err(|_| Error::Poisoned)?.value = value;
```

## Hard rules

- Nothing blocking on a runtime worker: no `std::thread::sleep`, no synchronous file or socket IO,
  no long CPU loop — `spawn_blocking` or a dedicated thread.
- An unbounded `spawn` loop lets arriving load dictate memory use; bound it with a literal.
- No guard, `RefCell` borrow or `Rc` may be alive across an `.await`.
- `unsafe impl Send` / `Sync` is never the fix for a `Send` error; the type or the task shape is.
- Every atomic starts `Relaxed` and is promoted only with a comment naming the edge.

## Done when

- every fan-out site has a literal concurrency bound and consumes its results (no lost `JoinHandle`)
- no blocking call appears in an `async fn` that runs on a runtime worker
- cancellation leaves no half-applied state, and every task is joined or documented as detached
- tests pass, and hand-written synchronization has run under `loom` or Miri
