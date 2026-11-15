---
name: rust-web
description: Build Rust HTTP services with axum or actix-web — routers, handlers, extractors, shared state, tower layers, error responses, CORS, body limits, and graceful shutdown. Use when the user mentions web, axum, actix, HTTP, API, handler, extractor, router, state, tower, CORS, or graceful shutdown, or asks to add an endpoint, restructure a service, or map domain errors to status codes.
---

# Rust Web Services

**Handler** is the unit of work: parse, authorize, delegate, render — four stages, each allowed to fail without a panic. The framework changes the extractor syntax, not the design.

Examples below use axum idioms. Path parameters are `{id}` and serving is `axum::serve(listener, app)` in current releases, but both changed within the last few majors — check the docs for the version in `Cargo.toml` before copying a snippet from memory.

## Route first

| Task | Go to |
|---|---|
| Rule text for `async-*`, `err-*`, `obs-*`, `serde-*`, `api-*` | `rust-skills` |
| Full service workflow, `references/backend.md` | `rust-skill` |
| Tower middleware: request IDs, auth checks, rate limits | `rust-middleware` |
| Login, sessions, token and password handling | `rust-auth` |
| Response caching, ETag, invalidation | `rust-cache` |
| Background jobs, long-running work off the request path | `rust-actor` |
| Runtime choice, `spawn`, cancel-safety, blocking work | `rust-async` |
| Spans, structured logs, error-chain reporting | `rust-observability` |
| Queries, pooling, migrations | `rust-database` |
| Per-request allocation cost | `rust-performance` |
| Handler-layer conventions and naming | `rust-coding` |

## Playbook

1. **Write the contract before the code.** For each route: method, path, request type, success status and body, and every failure status with its body. *Done when* each route has one success and one failure example written down, ready to become a test.
2. **One `Clone` state struct.** `#[derive(Clone)] struct AppState { users: UserRepo, cfg: Arc<Config> }`, mounted with `.with_state(state)`; handlers take `State<AppState>`. Cloning must be cheap — `Arc`, a pool handle, or a copy type, never a `Vec` (`own-arc-shared`, `own-copy-small`). *Done when* adding one dependency touches only `AppState` and no other handler signature.
3. **Extractor order is a rule, not taste.** `State`, `Path`, `Query`, headers first; body-consuming extractors (`Json`, `Form`, `Bytes`, `String`) last, because they consume the request. *Done when* every handler compiles and no handler reads the body twice.
4. **One `ApiError`, one `IntoResponse`.** Map each domain error variant to a status once; log the internal error with its chain, return a stable public message. *Done when* a single `match` covers every variant and no `Display` of an inner error reaches the client (`err-context-chain`, `obs-structured-fields`).
5. **Stack layers outermost-first.** Trace, then CORS, then timeout/concurrency, then body limit; layers added via `.layer()` apply to routes registered before the call, so mount them on the final router. *Done when* a 404 from an unknown path still produces the trace span, and an oversized body returns 413 without entering the handler.
6. **Bound the request.** Timeout, `DefaultBodyLimit`, and bounded channels for fan-out (`async-bounded-channel`). An unbounded queue turns a load spike into an OOM. *Done when* each limit has a test that trips it.
7. **Shut down gracefully.** `axum::serve(...).with_graceful_shutdown(signal)` stops accepting, drains in-flight requests, then cancels background tasks via a `CancellationToken` (`async-cancel-safety`, `async-cancellation-token`). *Done when* an in-flight slow request completes after the signal and a new connection is refused.
8. **Test through the router.** `app.oneshot(Request::get("/users/1").body(Body::empty()).unwrap())` with `tower::ServiceExt` — no port, no socket, no flake (`test-tokio-async`).

```rust
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};

async fn get_user(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<User>, ApiError> {
    let user = state.users.by_id(id).await?; // ? converts domain error → ApiError
    Ok(Json(user))
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/users/{id}", get(get_user))
        .with_state(state)
}
```

```rust
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, public) = match &self {
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not found"),
            ApiError::Validation(_) => (StatusCode::UNPROCESSABLE_ENTITY, "invalid request"),
            ApiError::Internal(err) => {
                tracing::error!(error = ?err, "request failed"); // detail stays in logs
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error")
            }
        };
        (status, Json(serde_json::json!({ "error": public }))).into_response()
    }
}
```

## Hard rules

- No `unwrap`, `expect`, `panic!`, or direct slice indexing in handler or middleware code — a panic aborts the response, and the client sees a dropped connection with no status.
- Never hold a lock guard, `RefCell` borrow, or open transaction across `.await` (`async-no-lock-await`).
- No blocking work on the request path: file I/O, DNS, CPU-heavy loops go to `spawn_blocking` or a worker (`async-spawn-blocking`).
- Return stable error payloads; internal messages and stack detail belong in logs, not in the response body.
- Do not hand-roll an HTTP parser or accept loop when the framework already provides routing, limits, and shutdown.

## Done when

- Each route has a `oneshot` test covering success and one failure with the exact status and body shape.
- A shutdown test shows an in-flight request finishing after the signal fires.
- `grep` finds no `unwrap`/`panic!` in handlers, and every router has a body limit and a timeout.
- No `.await` occurs while a guard or transaction is alive.
