---
name: rust-coroutine
description: Coroutines, generators and green threads in Rust — choose between the compiler's stackless `async` state machine, a `Stream` for yield sequences, an explicit state enum, and stackful coroutines that own a stack. Use when the user mentions coroutine, generator, suspend/resume, yield, green thread, stackful, stackless, coroutine crate or user-space scheduling; or asks how to suspend from a nested call, how to resume a computation where it left off, whether `gen` blocks are usable yet, or how to write a scheduler or interpreter in Rust.
---

# Coroutines & Generators

**Suspend.** Rust ships exactly one stable coroutine mechanism: `async`, which the compiler lowers
into a *stackless* state machine — no stack per task, `Pin`ned so its internal references stay
valid, polled by an executor. A generator is that same machinery with a value between polls.
Stackful coroutines are a different animal, and a deliberate, niche choice.

## Route first

| Concern | Go to |
|---|---|
| Rule text (`async-cancel-safety`, `async-no-lock-await`, `async-clone-before-await`, `async-tokio-runtime`) | `rust-skills` |
| The workflow around the feature | `rust-skill` |
| Pipelines, backpressure, `select!`, cancellation semantics | `rust-async` |
| Task topology, `'static` spawns, graceful shutdown | `rust-async-pattern` |
| `Send`/`Sync`, threads, shared state | `rust-concurrency` |
| Why the future is `!Unpin`; self-reference rules | `rust-pin` |
| Cleanup when a coroutine is dropped mid-flight | `rust-resource` |
| Hand-written `poll` or coroutine trait impl with raw pointers | `rust-unsafe` |
| Coroutine in firmware or a `no_std` executor | `rust-embedded` |
| Scheduling cost, stack sizes showing up in a profile | `rust-performance` |

## Playbook

Escalate only as far as the suspension depth demands; each rung is a downgrade in portability.

1. **`async fn` — the default.** Reach for anything else only when a value must suspend from inside
   a callback several frames below the coroutine. Done when every suspension point in the design is
   a syntactic `.await` in the coroutine or in a function it awaits.
2. **`Stream` — yield a sequence.** `async-stream`'s `stream!` / `try_stream!` today; the generated
   stream is `!Unpin`, so `pin_mut!` or `Box::pin` before `next()`. Done when the consumer drives
   it with `next().await` and no OS thread is parked on a `recv`.
3. **Explicit state enum — resumable protocol, no runtime.** One `enum` for the states plus
   `fn step(self) -> Step`. Done when the state is a plain `Send + 'static` value that could be
   serialised, and no borrow lives across a resume.
4. **Stackful coroutine — suspend through nested calls.** `corosensei`, `may`, or the older
   `generator` crate: each instance owns a stack, switching is platform-specific context code, and
   `Send`/`Pin` are the crate's properties, not yours. Done when you budgeted stack bytes per
   coroutine and confirmed each crate still supports every target you ship — check maintenance
   status, several of these are dormant.
5. **Settle `Send` before writing the loop.** Values that are not `Send`, and lock guards, must not
   be alive across an `.await` in a spawned task (`async-no-lock-await`, `async-clone-before-await`).
   Done when `Send`-ness is stated in the signature, not discovered at the `spawn` call.
6. **Cancellation is the only stop signal.** Dropping the future between polls is the kill; cleanup
   that must run belongs in `Drop` or a cancellation-safe handoff (`rust-resource`). Done when
   dropping the future at any `.await` leaves the outside world consistent.

## Examples

```rust
// Generator as an explicit state enum: no runtime, no `Pin`, no allocation per step.
enum Step {
    Yield(u64, Fib),
    Done,
}

struct Fib {
    a: u64,
    b: u64,
}

impl Fib {
    fn resume(self) -> Step {
        if self.a > 1_000 {
            return Step::Done;
        }
        Step::Yield(self.a, Fib { a: self.b, b: self.a + self.b })
    }
}

fn main() {
    let mut step = Fib { a: 0, b: 1 }.resume();
    while let Step::Yield(value, next) = step {
        println!("{value}");
        step = next.resume();
    }
}
```

```rust
use async_stream::stream;
use futures::Stream;

// Same idea with a runtime: the loop is resumed only when the consumer polls.
// `try_stream!` yields `Result` items. The stream is `!Unpin`; pin it before `next()`.
fn split_lines(buf: Vec<u8>) -> impl Stream<Item = Vec<u8>> {
    stream! {
        let mut start = 0;
        for (i, &byte) in buf.iter().enumerate() {
            if byte == b'\n' {
                yield buf[start..i].to_vec();
                start = i + 1;
            }
        }
        if start < buf.len() {
            yield buf[start..].to_vec();
        }
    }
}
```

## Hard rules

- `gen` blocks, `#[coroutine]` closures and manual `core::ops::Coroutine` impls are nightly-only
  (feature `gen_blocks`); check current status before citing them and never ship them by accident.
- Stackless means one heap allocation for the state machine and no stack; stackful means a real
  stack per coroutine — budget it explicitly, do not assume it is free.
- `Box::pin` fixes the size of the type, never the depth of recursion; unbounded recursion overflows
  whatever stack the poll runs on.
- No unstable escape hatch, thread-per-`yield`, or callback trampoline when rung 1 or 2 covers the
  problem.
- A stackful coroutine that panics or is dropped mid-run must leave the outer state consistent.

## Done when

- the chosen mechanism is the cheapest rung that satisfies the suspension depth, and it is named
  in the design or PR
- no `#![feature(...)]` appears outside a scratch branch, and no `gen` syntax is in shipped code
- every generator is a `Stream` or an explicit state enum — not a thread parked on a channel
- if stackful, the per-coroutine stack budget and supported targets are written down
