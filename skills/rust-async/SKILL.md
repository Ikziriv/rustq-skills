---
name: rust-async
description: Async dataflow in Rust — model a pipeline as streams and futures, bound every edge, and choose join, try_join or select without losing data to cancellation. Use when the user mentions `Stream`, backpressure, `select!`, `join!`, cancellation safety, `timeout`, `buffer_unordered`, or `TryStreamExt`; or asks why a `select!` drops messages, how to slow a producer down, or how to stop a stream pipeline at the first error.
---

# Async Dataflow

A future is a state machine someone else **polls**; a stream is that machine with an item between
polls. **Leading word: poll.** Every choice below is about who polls, how often, and what happens
to the work that is no longer being polled.

## Route first

| Concern | Go to |
|---|---|
| Rule text (`async-cancel-safety`, `async-select-racing`, `async-join-parallel`, `async-try-join`, `async-bounded-channel`, `async-watch-latest`) | `rust-skills` |
| Whole-service workflow, handlers, layers | `rust-skill` |
| Task lifecycle, `'static` spawns, supervision, shutdown | `rust-async-pattern` |
| Threads, rayon, `Send`/`Sync`, shared state | `rust-concurrency` |
| Future will not compile: `!Send`, borrow across `.await`, opaque type | `rust-pin`, `rust-lifetime-complex` |
| Errors in the stream, `JoinError`, retries | `rust-error` |
| Hand-written `Stream`/`Future` impl with `unsafe` in `poll` | `rust-unsafe` |
| Edge timeouts, load shedding, request limits | `rust-web` |

## Playbook

1. **Draw the graph.** Sources → transforms → sink, with the item type on every edge. Done when
   each edge has an item type and a stated bound (1, N, or unbounded).
2. **Pick one primitive per edge.** Bounded `mpsc` for a queue, `watch` for latest-value, `broadcast`
   for fan-out events, `oneshot` for one reply, a `Stream` for per-item flow. Done when no edge
   carrying network input is unbounded.
3. **Make backpressure real.** Await the send; never `try_send` in a loop that discards on full.
   For fan-out use `buffer_unordered(n)` with a literal `n`. Done when a slow consumer slows the
   producer instead of growing memory.
4. **Choose the combinator by what happens to the losers.** `join!` — fixed set, all results
   needed; `try_join!` — same but fail fast; `select!` — first to finish wins and the rest are
   dropped; `FuturesUnordered` / `JoinSet` — dynamic set. Done when each fan-out site names its
   combinator and says whether the losers are cancelled (`async-join-parallel`,
   `async-select-racing`).
5. **Audit cancellation.** Only cancel-safe operations inside `select!` and `timeout`; state that
   must survive lives outside the future; a long operation takes a token and checks it. Done when
   dropping the future at any `.await` leaves the pipeline consistent
   (`async-cancel-safety`).
6. **Put a deadline on every external await.** `tokio::time::timeout` at the boundary, and timeout
   distinguished from error in the return type. Done when a never-completing dependency produces a
   typed timeout rather than a hang.
7. **Fail the pipeline deliberately.** `try_next` / `try_for_each` / `try_collect` stop at the first
   error; wrapping in `Ok` continues. Done when the stop-or-continue choice is visible in the
   combinator, not in an `if` inside a `filter_map`.

## Examples

```rust
use tokio::sync::mpsc;

// Awaiting the send *is* the backpressure: the producer stalls while the sink is full.
async fn pipeline(mut rx: mpsc::Receiver<Job>, out: mpsc::Sender<Done>) {
    while let Some(job) = rx.recv().await {
        let done = job.run().await;
        if out.send(done).await.is_err() {
            break; // sink is gone: stop pulling work nobody will read
        }
    }
}
```

```rust
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};

// `recv` and `sleep` are both cancel-safe, so dropping the losing branch loses nothing.
async fn next_event(rx: &mut mpsc::Receiver<Event>) -> Event {
    match timeout(Duration::from_secs(1), rx.recv()).await {
        Ok(Some(event)) => event,
        Ok(None) => Event::Closed,
        Err(_elapsed) => Event::Tick,
    }
}
```

```rust
use futures::{SinkExt, TryStreamExt};

// End-to-end backpressure across a stream/sink pair; the first error ends the loop.
async fn drain<S, K>(mut src: S, mut sink: K) -> Result<(), Error>
where
    S: futures::TryStream<Ok = Record, Error = Error> + Unpin,
    K: futures::Sink<Record, Error = Error> + Unpin,
{
    while let Some(record) = src.try_next().await? {
        sink.send(record).await?;
    }
    sink.close().await
}
```

## Hard rules

- An unbounded channel is a memory leak with a schedule; bound every edge that carries input.
- Only cancel-safe operations inside `select!` and `timeout`; partial state stays outside the
  future, never in a local that the dropped branch owned.
- `join!` waits for all, `select!` drops the losers — the choice is a correctness decision, not a
  style preference.
- No lock guard, `RefCell` borrow or `Rc` may be alive across an `.await`.
- `try_send`-and-discard is never a substitute for backpressure; await the send or surface the
  refusal.

## Done when

- every channel is bounded, or is a `watch`/`broadcast` where dropping old values is the contract
- every external await has a deadline, and a test fires it
- no non-cancel-safe operation appears in a `select!` branch
- the pipeline either stops cleanly on the first error or continues by an explicit choice, with no
  half-written state
