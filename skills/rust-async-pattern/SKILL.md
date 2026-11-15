---
name: rust-async-pattern
description: Async task architecture in Rust — decide what lives for the process, what a task owns, and how it stops, then supervise it with JoinSet, cancellation tokens and bounded inboxes. Use when the user mentions `tokio::spawn`, `'static` tasks, background workers, plugin architectures, supervision, graceful shutdown, `JoinSet`, or `TaskTracker`; or asks how to shut a service down cleanly, how to restart a panicking worker, or why a spawned future demands `'static`.
---

# Async Task Architecture

Every async design answers three questions: what lives for the whole process, what a task owns
outright, and who may say "stop". **Leading word: scope.** `tokio::spawn` is a scope boundary —
what it captures must outlive the caller, which is what `'static` states.

## Route first

| Concern | Go to |
|---|---|
| Rule text (`async-joinset-structured`, `async-cancellation-token`, `async-mpsc-queue`, `async-watch-latest`, `async-oneshot-response`, `async-spawn-blocking`, `async-tokio-runtime`, `anti-lock-across-await`) | `rust-skills` |
| Service wiring, runtime setup, axum/tokio layers | `rust-skill` |
| Streams, backpressure, `select!` cancellation rules | `rust-async` |
| Threads, rayon, `Send`/`Sync`, shared state | `rust-concurrency` |
| `'static` on spawned futures, trait objects behind a plugin trait | `rust-lifetime-complex` |
| Which `Arc`/`Rc` to hand across the spawn | `rust-ownership` |
| Panics, `JoinError`, retry policy, error propagation out of tasks | `rust-error` |
| `unsafe impl Send` added to make a task spawn | `rust-unsafe` |
| Plugin trait shape, object safety, sealed extension points | `rust-type-driven` |

## Playbook

1. **Map the ownership.** Process-wide (config, pool, metrics), task-owned (mutable state),
   request-owned (per-call data). Done when each piece of mutable state has one owning task and a
   channel in front of it — no `Arc<Mutex<State>>` shared by strangers.
2. **Derive the spawn shape.** `tokio::spawn` needs `Send + 'static`; move an owned handle or an
   `Arc` in, never a borrow or a live guard. Done when the code compiles without a lifetime
   annotation on the spawn and without an `Arc<Mutex<_>>` added to satisfy `'static`.
3. **Give each worker a protocol.** A bounded `mpsc` inbox, a `oneshot` reply path, `watch` for
   config, and a defined behaviour when the inbox closes. Done when the worker loop has one
   `select!` arm per input plus a shutdown arm.
4. **Supervise deliberately.** A supervisor owns a `JoinSet` (or `TaskTracker`), reads
   `join_next` results, restarts on `JoinError` with capped backoff, and counts restarts. Done when
   a panicking child is restarted or escalated, never silently dropped with its `JoinHandle`
   (`async-joinset-structured`).
5. **Flow shutdown downward.** `CancellationToken` (or `watch<bool>`) from `main`; children select
   on it; in-flight work drains to a deadline, then `abort_all` and drain the set. Done when
   SIGINT/SIGTERM stops intake, finishes in-flight work, and every task is joined.
6. **Keep the core free of plugin knowledge.** Plugin traits are `Send + Sync + 'static` or a
   command enum; registration hands back handles; no plugin borrows from the core. Done when
   plugins are reachable only through the trait or enum and drop in a defined order.

## Examples

```rust
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

enum Command { Reindex { ack: oneshot::Sender<u64> }, Stop }

// The spawned future is `'static`: it owns its receiver and its token, and borrows nothing.
async fn worker(mut inbox: mpsc::Receiver<Command>, shutdown: CancellationToken) {
    loop {
        tokio::select! {
            // `recv` and `cancelled` are cancel-safe: dropping one loses no message.
            cmd = inbox.recv() => match cmd {
                Some(Command::Reindex { ack }) => { let _ = ack.send(42); }
                Some(Command::Stop) | None => break,
            },
            _ = shutdown.cancelled() => break,
        }
    }
}
```

```rust
use std::future::Future;
use std::time::Duration;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

/// Restarts a child with capped exponential backoff; reports a terminal error upward.
async fn supervise<F, Fut>(make: F, shutdown: CancellationToken) -> Result<(), FatalError>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<(), FatalError>> + Send + 'static,
{
    let mut backoff = Duration::from_millis(50);
    let mut set: JoinSet<Result<(), FatalError>> = JoinSet::new();
    set.spawn(make());
    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                set.abort_all();
                while set.join_next().await.is_some() {} // drain before returning
                return Ok(());
            }
            joined = set.join_next() => match joined {
                Some(Ok(Ok(()))) => return Ok(()),
                Some(Ok(Err(fatal))) => return Err(fatal),
                Some(Err(_join_error)) => { // panicked or aborted: restart
                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(Duration::from_secs(30));
                    set.spawn(make());
                }
                None => return Ok(()), // set empty, nothing left to supervise
            },
        }
    }
}
```

## Hard rules

- `'static` is a scope statement: move an owned handle or `Arc` into the task; never widen a
  borrow or add a lock to satisfy it.
- Every `JoinHandle` is awaited, held in a `JoinSet`, or documented as detached — a dropped handle
  reports nothing, not even a panic.
- No `spawn` in an unbounded loop; a `Semaphore`, `buffer_unordered(n)` or a bounded inbox sets
  the concurrency.
- Shutdown flows down as a signal and is awaited up; the process never exits mid-write.
- Blocking work leaves the runtime (`spawn_blocking`), and no `std` guard is held across `.await`.

## Done when

- every task has an owner that joins it and a named exit path (inbox closed, token cancelled,
  supervised failure), and no shared mutable state exists without one owning task
- SIGINT/SIGTERM stops intake, drains within a deadline, exits 0, and no task is left unjoined
- a forced panic in a child is observed by the supervisor and restarted or escalated, with a test that proves it
- no shared mutable state exists without exactly one owning task
