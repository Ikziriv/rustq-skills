---
name: rust-observability
description: Tracing, metrics and logs for Rust services — choose the signal per fact, install one subscriber at the process edge, span each request with structured fields, and keep cardinality and PII bounded. Use when the user mentions tracing, span, subscriber, opentelemetry, metrics, prometheus, structured logging, log level, RUST_LOG, request id, sampling, or cardinality, or asks why a spawned task lost its parent span, why one metric label exploded the series count, or why the same error is logged once per layer.
---

# Observability: Tracing, Metrics & Logs

Logs are events you read one at a time, traces are causality you follow across services, metrics are
aggregates you alert on. **Leading word: signal.** Decide the field and the question it answers
before picking a backend — cardinality and retention are the costs you cannot undo.

## Route first

| Concern | Go to |
|---|---|
| Rule text for spans, fields, levels, redaction | `rust-skills` → `obs-*` (`obs-instrument-spans`, `obs-structured-fields`, `obs-levels-filter`, `obs-library-facade`, `obs-no-sensitive-data`, `obs-error-chain`) |
| The workflow for the code being instrumented | `rust-skill` |
| Request-id layer, `TraceLayer`, layer position | `rust-middleware` |
| Error taxonomy, retry classification, error → status mapping | `rust-error-advanced`, `rust-web` |
| Tokens, claims and cookies that must never reach a log | `rust-auth` |
| Spans across `.await`, spawned tasks, cancellation | `rust-async`, `rust-async-pattern` |
| Query and pool instrumentation, trace-to-SQL correlation | `rust-database` |

## Playbook

1. **Pick one signal per fact, before choosing a backend.**

   | Fact | Signal |
   |---|---|
   | where did this request spend its time | span tree |
   | did this operation fail, and why | event carrying the error chain |
   | how often, how many; alert on it | metric, bounded labels |

   *Done when* every span, event and metric in the diff maps to one row.
2. **Libraries emit; only the binary installs.** A library depends on `tracing` alone and calls no
   `init()` (`obs-library-facade`). *Done when* the process has exactly one `.init()` and no library
   crate depends on `tracing-subscriber`.
3. **Filter from the environment.** `EnvFilter::try_from_default_env()` over `RUST_LOG`
   (`info,myapp=debug,hyper=warn`), with a quiet fallback. *Done when* changing verbosity needs no
   rebuild.
4. **One span per request, carrying its identity.** `#[instrument]` on the entry function of the
   unit of work, `request.id` as a field, `http.route` as the **template**; set the span's parent from
   the inbound `traceparent` at the edge. *Done when* one request yields one span tree rooted at its id.
5. **Fields, never interpolated messages.** `user_id = %id`, `rows = n`, `attempt = retry`; the
   message stays a constant description so queries can split on the values
   (`obs-structured-fields`). *Done when* no message string contains an id, number or duration.
6. **Choose the instrument by the question.** Counter for how many, gauge for a value that rises and
   falls, histogram for a distribution and its percentiles. Services get RED per route — rate,
   errors, duration; resources get USE — utilisation, saturation, errors. *Done when* each instrument
   names the chart it feeds.
7. **Every label is bounded.** Cardinality is the cost driver: labels come from a static set (route
   template, method, status class, region), never a user id, raw path, trace id or error text.
   *Done when* you can print the full value set of every label.
8. **Redact at the type, not the call site.** `skip_all` plus an explicit `fields(...)` allow-list;
   a newtype whose `Debug` prints `[redacted]`; never tokens, passwords, cookies, full claims,
   bodies or raw emails (`obs-no-sensitive-data`). *Done when* a staging run at `RUST_LOG=trace`
   contains nothing a customer would object to.
9. **Propagate everywhere, batch the export, flush on shutdown.** Batch spans; head sampling must
   inherit the parent decision so a trace is never half-sampled; force-keep errored traces
   (tail-sampling at the collector, usually). A spawned task keeps the span through
   `#[instrument]` / `.instrument(..)`; a queue carries it in the message headers, never in a
   thread-local. *Done when* one trace id spans producer, HTTP call and consumer, and shutdown flushes.
10. **One error, one line, at the boundary that decides.** Inner layers add context and return with
    `?`; the handler logs `?err` (Debug prints the whole `source()` chain) and converts to a public
    response. Levels: `error` = a human must act, `warn` = degraded or fallback taken, `info` =
    lifecycle, `debug` = diagnosis (off in production). *Done when* one failure produces one error
    line ending at the root cause.

## Examples

```rust
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

// Binary only: one install, at the process edge. Libraries just emit.
pub fn init_telemetry() {
    // `RUST_LOG=info,myapp=debug` overrides the fallback without a rebuild.
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,myapp=debug"));
    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().json()) // `json` feature; drop it for human output
        // .with(otlp_layer)       // one more `.with(..)`: the batch span processor
        .init(); // panics if called twice — keep the provider handle and flush it on SIGTERM
}
```

```rust
use tracing::{error, instrument};

// `skip_all` is the default that fails safe: a request body is PII until proven otherwise.
#[instrument(skip_all, fields(request.id = %ctx.request_id, http.route = "/users/{id}"))]
async fn update_user(state: &State, ctx: &RequestCtx, id: UserId, body: Profile)
    -> Result<Json<User>, ApiError> {
    match state.users.update(id, body).await {
        Ok(user) => Ok(Json(user)),
        Err(err) => {
            // Only the deciding boundary logs, once. `?err` walks the source chain;
            // `%err` would print the top message and lose the cause.
            error!(error = ?err, "update_user failed");
            Err(err.into())
        }
    }
}
```

```rust
// Labels from a fixed set — the route template, never `/users/42`.
metrics::histogram!("http_request_duration_seconds", "route" => "/users/{id}", "method" => "PATCH")
    .record(started.elapsed().as_secs_f64());
metrics::counter!("http_requests_total", "route" => "/users/{id}", "status" => "409").increment(1);
```

`tracing-subscriber`, `metrics` and the `opentelemetry` crates reshape their builder, exporter and
propagator APIs between releases — check current docs for the versions in `Cargo.toml`.

## Hard rules

- A library installs no subscriber, exporter or output format; it emits and stops (`obs-library-facade`).
- No secret or personal datum in a field, message or label — redact at the type (`obs-no-sensitive-data`).
- Metric labels come from a bounded, printable set; ids, raw paths and error strings are unbounded.
- One error, one log line, at the boundary that handles it, with `source()` intact (`obs-error-chain`).
- No span guard held across `.await` — use `#[instrument]` or `.instrument(span)`.

## Done when

- every span, event and metric maps to a row of the signal table, and the binary owns the setup
- `RUST_LOG` changes verbosity without a rebuild, and one subscriber is installed per process
- a staging `RUST_LOG=trace` run shows no token, claim, body or email
- one trace id follows a request through HTTP, a spawned task and a queue consumer
