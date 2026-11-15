---
name: rust-error-advanced
description: Design error taxonomies in Rust — one public enum per crate with `#[source]` intact, typed errors in libraries and `anyhow` only at the edge, retry classification as code, and a single mapping to status codes. Use when the user mentions thiserror, anyhow, error enum, error context, source chain, boxed error, `Box<dyn Error>`, error taxonomy, retryable error, error code, backtrace, or error boundaries, or asks where to convert between error types, whether a failure should be retried, or why `source()` returns `None`.
---

# Advanced Error Design

`rust-error` owns the daily mechanics — `Result` vs `Option`, `?`, context, `unwrap` policy. This
skill owns the **shape of the type** once it crosses a crate, a public API or a task. **Leading word:
boundary.** Each boundary states what the caller can do and keeps `source()` intact to the root cause.

## Route first

| Concern | Go to |
|---|---|
| Rule text | `rust-skills` → `err-*` (`err-source-chain`, `err-from-impl`, `err-thiserror-lib`, `err-anyhow-app`, `err-context-chain`, `api-non-exhaustive`, `doc-errors-section`) |
| Basics: `Result` vs `Option`, `?`, context, `unwrap`/panic policy | `rust-error` |
| The workflow for the code being written | `rust-skill` |
| Domain error → HTTP status and body | `rust-web` |
| Auth failures → 401/403, never leaking claims | `rust-auth` |
| Errors crossing `tokio::spawn`, cancellation, `'static` task bounds | `rust-async`, `rust-async-pattern` |
| Emitting the error once, with its chain | `rust-observability` |
| Error-path tests, `#[should_panic]` | `rust-testing` |

## Playbook

1. **Classify by the caller's action, not by the cause.**

   | Class | Test | Caller does |
   |---|---|---|
   | transient | the same call may succeed | retry with backoff, capped |
   | permanent | the same call never will | correct the request, do not retry |
   | programmer error | the code is wrong | log at `error`, alert, never retry |

   *Done when* every variant maps to one row and the row is testable.
2. **One public enum per crate, not one per layer.** An enum per dependency (`DbError`, `HttpError`,
   `ParseError` wrapping one vendor type each) mirrors the dependency graph into your API. Wrap the
   vendor error in the variant that means something here — `Timeout`, not `Reqwest`: `#[non_exhaustive]`,
   data-carrying variants, `#[source]` on the cause. *Done when* one enum is exported and vendor types
   appear only behind `#[source]`.
3. **Types in libraries, `anyhow` in binaries, one crossing point.**

   | Shape | Belongs at | Costs |
   |---|---|---|
   | crate `enum` (`thiserror`) | library public API | one variant per new failure — that is the point |
   | `anyhow::Error` | binary, glue, tests | no exhaustive `match`; `.context()` is a string, not a type |
   | `Box<dyn Error + Send + Sync>` | prototypes, small tools, `main` | no `match`, no `From` recovery, no `is_retryable()` |

   *Done when* no library crate lists `anyhow` as a normal dependency, and exactly one function turns
   a typed error into a response or exit code.
4. **`From` for the mechanical, `map_err` where the message is the point.** Use `#[from]` when the
   conversion is total and the caller learns nothing more; use `map_err` when the outer layer must add
   the id, path or operation the source lacks. `map_err(|e| e.to_string())` discards both.
   *Done when* every `map_err` closure captures a value the source error does not carry.
5. **Retry is a property of the variant, not of the message.** `fn is_retryable(&self) -> bool`, or a
   `Retryable` marker trait, matched exhaustively; retry idempotent work only, with backoff, a cap and
   jitter, and honour `Retry-After`. `msg.contains("timeout")` breaks the moment a dependency rewords
   a message — a defect, not a heuristic. *Done when* the match is exhaustive and a test proves a
   permanent variant is attempted once.
6. **Map to transport in exactly one place.** One function maps domain → HTTP status, gRPC code or
   exit code; error codes are stable strings, documented per variant and additive-only; the client
   gets the code and a safe message, the log gets the chain (`obs-no-sensitive-data`). *Done when* the
   mapping is a single `match`, every code pinned by a test, no `source()` text in the response body.
7. **Diagnose once, at the boundary.** Walk `source()` to print the chain (`obs-error-chain`); put
   `#[track_caller]` on constructors that should blame the caller's line, and a `Backtrace` only where
   the stack is the diagnosis — it is not free and does not belong in every variant. *Done when* one
   failure produces one log line ending at the root cause.
8. **Carry the type across a spawn.** `JoinHandle<Result<T, E>>` keeps `E`; `JoinError` means the task
   panicked or was cancelled, so it gets its own variant — folded into a business error, a cancellation
   is indistinguishable from a real incident. *Done when* a panicking task surfaces as its own variant.

## Examples

```rust
#[derive(Debug, thiserror::Error)]
#[non_exhaustive] // a new variant stays additive for downstream crates
pub enum PaymentError {
    #[error("account {id} has insufficient funds")]
    InsufficientFunds { id: AccountId, available: Money },
    #[error("card network declined the payment")]
    Declined {
        #[source]
        source: NetworkError, // vendor detail, typed — not a String
    },
    #[error("provider timed out after {ms}ms")]
    Timeout { ms: u64 },
}
```

```rust
// One place owns domain → transport and retry. This crate is not the one defining
// `PaymentError`, so `#[non_exhaustive]` forces the catch-all arm.
pub fn status_and_code(err: &ApiError) -> (StatusCode, &'static str) {
    match err {
        ApiError::Payment(PaymentError::InsufficientFunds { .. }) => (StatusCode::CONFLICT, "payment_insufficient_funds"),
        ApiError::Payment(PaymentError::Declined { .. }) => (StatusCode::PAYMENT_REQUIRED, "payment_declined"),
        ApiError::Payment(PaymentError::Timeout { .. }) => (StatusCode::GATEWAY_TIMEOUT, "payment_timeout"),
        _ => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
    }
}

pub fn is_retryable(err: &ApiError) -> bool { matches!(err, ApiError::Payment(PaymentError::Timeout { .. })) }
```

```rust
#[derive(Debug, thiserror::Error)]
pub enum JobError {
    #[error("job failed")]
    Job(#[from] PaymentError), // `#[from]` implies `#[source]`
    #[error("job task panicked or was cancelled")]
    Task(#[source] JoinError),
}

// Panic and cancellation are the task's fate, not a payment outcome.
async fn settle(handle: JoinHandle<Result<Receipt, PaymentError>>) -> Result<Receipt, JobError> {
    Ok(handle.await.map_err(JobError::Task)??)
}
```

## Hard rules

- A library's public boundary returns its own enum; `anyhow::Error` and `Box<dyn Error>` stop at `main`, glue and tests.
- One public enum per crate: `#[non_exhaustive]`, data-carrying variants, `#[source]` on every wrapped cause.
- Retryability and transport mapping are `match` arms over the type — never string matching, never inferred at the call site.
- `JoinError` is its own variant; a panic or cancellation is never reported as a business failure.
- Codes and variants are additive-only, and no internal cause text reaches a client.

## Done when

- one public error enum per crate, `#[non_exhaustive]`, every variant naming one caller action
- `{:#}` on the binary's `anyhow::Error` prints operation → layer → root cause, every `source()` link a real type
- `is_retryable()` and `status_and_code()` are one `match` each, every visible variant pinned by a test
- a panicking `tokio::spawn` surfaces as a task variant, not as a business error
