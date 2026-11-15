---
name: rust-middleware
description: Build tower and tower-http middleware for Rust services — layer ordering, request IDs, tracing, CORS, timeouts, body limits, compression and rate limiting, each tested at the stack. Use when the user mentions middleware, tower layer, Service, Layer, CORS, rate limit, timeout, request id, compression, body limit, or asks where a layer belongs, why a layer has no effect, or how to add an auth or tracing layer to every route.
---

# Middleware & Layers

A **layer** wraps a service: it sees the request on the way in, the response on the way out, and owns
exactly one policy. Order is not style — a layer only observes rejections from layers inside it.
Built-in policies beat hand-written ones; write a `Service` only when the policy is yours.

## Route first

| Concern | Go to |
|---|---|
| Rule text for async, errors, API shapes | `rust-skills` (`async-*`, `err-*`, `api-*`, `anti-lock-across-await`) |
| The workflow for the service being wrapped | `rust-skill` |
| Routers, extractors, error → status mapping | `rust-web` |
| The identity the auth layer inserts | `rust-auth` |
| Cache headers, ETag, conditional requests | `rust-cache` |
| Concurrency limits, cancel-safety, hand-rolled futures | `rust-async` |
| What a layer should record in spans and metrics | `rust-observability` |

## Playbook

1. **One sentence per layer.** "Reject bodies over 1 MiB", "abort after 5 s", "stamp a correlation
   id". *Done when* each layer maps to a sentence and a status or error it produces.
2. **Order outside-in, and justify each position.**

   | # | Layer | Why there |
   |---|---|---|
   | 1 | request id | everything inside must log with it |
   | 2 | trace/span | records inner rejections with the id |
   | 3 | CORS | error responses need the headers too |
   | 4 | compression | wraps the response body |
   | 5 | timeout | bounds the handler, not the compression |
   | 6 | load shed / concurrency | reject before doing work |
   | 7 | body limit | cheap, and before parsing |
   | 8 | auth | runs only if the request is admissible |

   *Done when* a 413 and a 429 both carry the request id and a span.
3. **Mount on the final router.** In axum, `.layer()` applies to routes registered before the call,
   and `route_layer` skips the 404 fallback. *Done when* an unknown path still gets an id and a span.
4. **Configure, don't reimplement.** `tower-http` supplies `SetRequestIdLayer` +
   `PropagateRequestIdLayer`, `TraceLayer`, `CorsLayer`, `TimeoutLayer`, `RequestBodyLimitLayer`,
   `CompressionLayer`, `LoadShedLayer`. *Done when* each policy is a configured built-in, or the
   reason it is not is written down.
5. **Pass identity through extensions, not globals.** The auth layer inserts a `Principal` into
   request extensions; downstream extractors read it. *Done when* no layer needs a `static` or a
   global `Mutex`.
6. **Know what a timeout bounds.** `TimeoutLayer` bounds the response future, not the work: a
   detached task keeps running. *Done when* a slow handler returns 504, and streaming responses have
   their own policy.
7. **Test the stack, not a port.** `tower::ServiceExt::oneshot` against the layered service with a
   stub inner service. *Done when* every policy has a test that trips it: oversized body, slow
   handler, missing header, over-limit burst.

## Examples

```rust
use std::time::Duration;
use axum::{Router, http::HeaderName, routing::get};
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer, cors::{Any, CorsLayer}, timeout::TimeoutLayer, trace::TraceLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
};

const REQUEST_ID: &str = "x-request-id";

fn app(state: AppState) -> Router {
    Router::new().route("/users/{id}", get(get_user)).with_state(state).layer(
        ServiceBuilder::new() // first added is outermost
            .layer(SetRequestIdLayer::new(HeaderName::from_static(REQUEST_ID), MakeRequestUuid))
            .layer(TraceLayer::new_for_http()) // sees the id: it is inside SetRequestId
            .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any))
            .layer(CompressionLayer::new())
            .layer(TimeoutLayer::new(Duration::from_secs(5)))
            .layer(PropagateRequestIdLayer::new(HeaderName::from_static(REQUEST_ID))),
    )
}
```

```rust
use axum::{
    extract::{Request, State}, http::StatusCode, middleware::Next, response::Response,
};

// Mounted with `middleware::from_fn_with_state(state, require_api_key)`
async fn require_api_key(
    State(state): State<AppState>, mut req: Request, next: Next,
) -> Result<Response, StatusCode> {
    let presented = req.headers().get("x-api-key")
        .and_then(|value| value.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let principal = state.keys.verify(presented).ok_or(StatusCode::UNAUTHORIZED)?;
    req.extensions_mut().insert(principal); // read downstream via an extractor
    Ok(next.run(req).await)
}
```

`tower-http` and `axum` changed layer constructors and body types across recent majors
(`TimeoutLayer::new(Duration)`, `axum::body::Body`) — check current docs against your `Cargo.toml`.

## Hard rules

- Layer order is behaviour: id and trace outermost, body limit before parsing, auth innermost.
- A queueing concurrency limit is not a rate limit — pair `ConcurrencyLimit` with `LoadShed`.
- Per-client rate limiting needs keyed state (Redis or `governor`), not one global window.
- No lock guard or `RefCell` borrow held across `.await` in a layer (`anti-lock-across-await`).
- Never buffer a body to inspect it; a limit must count bytes, not read them.

## Done when

- every layer has a `oneshot` test that trips its policy
- 4xx/5xx from inner layers carry the request id and a span
- the 404 fallback still passes through id and trace
- nothing blocking, and no guard held across `.await`, on the request path
