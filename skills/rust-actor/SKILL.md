---
name: rust-actor
description: Design actor-style concurrency in Rust — one owner per state, message enums with reply channels, bounded mailboxes, supervision and restart, backpressure and shutdown. Use when the user mentions actor, actor model, message passing, mailbox, supervision, backpressure, mpsc, actix, ractor, background worker, or asks to encapsulate mutable state behind a task, restart a failed worker, drain a queue on shutdown, or stop a queue growing without bound.
---

# Actors in Rust

An actor is one task, one **mailbox**, and one piece of state that nobody else may touch. The type
system does not enforce this — callers get a sender, so the state stays private by construction.

The model earns its cost when state must be read and mutated concurrently over time. For a single
use case, a function plus a lock is smaller and easier to test.

## Route first

| Concern | Go to |
|---|---|
| Rule text for channels, `Send`/`Sync`, ownership | `rust-skills` (`async-*`, `conc-*`, `own-arc-shared`, `async-bounded-channel`) |
| The workflow for the surrounding service | `rust-skill` |
| Choosing between channels, locks, rayon and a task | `rust-concurrency` |
| A plain request/response handler with no long-lived owner | `rust-web` |
| Concurrency bounds, cancel-safety, blocking work inside the actor | `rust-async` |
| Backpressure at the HTTP edge | `rust-middleware` |
| Durable jobs, outbox, transactions the actor writes through | `rust-database` |
| Mailbox depth, handler latency, restart counts | `rust-observability` |

## Playbook

1. **Justify the actor.** State mutated by concurrent callers with behaviour over time — rate-limit
   windows, pools, circuit breakers, refreshable caches. *Done when* you wrote down the
   `Mutex`-or-function alternative and why it is wrong here.
2. **Define the message enum first.** Every message is a value; every query carries a `oneshot`
   reply channel; fire-and-forget only where losing the message is permitted. *Done when* the
   `match` is exhaustive and no arm can panic on a malformed message.
3. **Make the mailbox the only way in.** The handle holds a `mpsc::Sender` and nothing else — no
   `Arc<Mutex<State>>` alongside the actor. *Done when* the handle's fields cannot reach the state.
4. **Bound the mailbox and choose the overflow policy.** `send().await` for backpressure,
   `try_send` to shed, drop-oldest only for telemetry. *Done when* a burst test shows that policy.
5. **Answer queries through `oneshot`.** Callers get a `Result` and a timeout, not optimism. *Done
   when* every query has a reply path and a caller-side timeout.
6. **Supervise, and recover from the source of truth.** On error or panic, restart with backoff and
   rebuild state from the database, never from the memory that just died. *Done when* a kill test
   shows recovery and a bounded restart rate.
7. **Shut down by message or token.** A `Shutdown` variant or `CancellationToken` that drains,
   finishes in-flight work, and exits. *Done when* a drop test leaves no task running and reports
   how many messages were discarded.
8. **Instrument the mailbox.** Depth gauge, messages processed, handler duration. *Done when* a
   stuck actor is visible as growing depth before callers start timing out.

## Examples

```rust
use tokio::sync::{mpsc, oneshot};

enum Command {
    Get { key: String, reply: oneshot::Sender<Option<u64>> },
    Set { key: String, value: u64 },
    Shutdown,
}

struct Handle {
    tx: mpsc::Sender<Command>, // the only field: no path to the state
}

impl Handle {
    async fn get(&self, key: String) -> Result<Option<u64>, ActorError> {
        let (reply, rx) = oneshot::channel();
        self.tx
            .send(Command::Get { key, reply })
            .await
            .map_err(|_| ActorError::Stopped)?; // actor gone
        rx.await.map_err(|_| ActorError::Stopped) // reply channel dropped
    }
}
```

```rust
use tokio_util::sync::CancellationToken;

async fn run(mut rx: mpsc::Receiver<Command>, mut state: State, shutdown: CancellationToken) {
    loop {
        let cmd = tokio::select! {
            _ = shutdown.cancelled() => break, // drain, then exit
            cmd = rx.recv() => match cmd { Some(cmd) => cmd, None => break },
        };

        match cmd {
            Command::Get { key, reply } => {
                let _ = reply.send(state.get(&key)); // caller may have timed out
            }
            Command::Set { key, value } => state.set(key, value),
            Command::Shutdown => break,
        }
    }
}
```

```rust
// Bounded mailbox: a full channel makes `send().await` wait — that wait is the backpressure
let (tx, rx) = mpsc::channel(64);
tokio::spawn(run(rx, State::default(), shutdown.clone()));
// On a hot path that must not stall, shed only loss-tolerant messages
if tx.try_send(Command::Set { key, value }).is_err() {
    tracing::warn!("mailbox full, update dropped"); // never do this for writes that must land
}
```

`actix` (`Actor`, `Context`, `Handler`) and `ractor` (`Actor`, `Supervisor`) give you mailboxes and
supervision trees; actix-web handlers do not need actors. Check the current API before copying.

## Hard rules

- One owner per state: the actor is the only writer, everyone else sends a message.
- No unbounded mailbox on any path untrusted input can drive.
- Every query message carries a reply channel; fire-and-forget is only for lossy work.
- Never `block_on`, `blocking_send`, or a long CPU loop inside an actor — it stalls the mailbox.
- A panicking arm kills the actor; handle the error or supervise the task, do not `unwrap` a message.

## Done when

- the handle exposes a sender and no state accessor
- a burst test demonstrates the overflow policy, and a kill test demonstrates restart with bounded
  backoff
- shutdown drains in-flight work and reports discarded messages
- mailbox depth and handler latency are exported, so a stall is visible before timeouts
