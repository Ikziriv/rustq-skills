# Rust Backend Services

## Runtime & concurrency

- Default to `tokio` with `#[tokio::main]` and the multi-threaded runtime. One runtime, one process.
- Never block the runtime: no `std::thread::sleep`, no blocking I/O, no `std::sync::Mutex` held across `.await`. Use `tokio::time::sleep`, async I/O, `tokio::sync::Mutex` (only across await), or `spawn_blocking` for CPU/blocking work.
- Bound concurrency: `tokio::sync::Semaphore`/`JoinSet` for fan-out; bounded channels for backpressure.
- Pick the channel by shape: `mpsc` (queue), `broadcast` (pub/sub), `watch` (latest value), `oneshot` (request/response). Bound channels for backpressure.
- `JoinSet` for a dynamic set of tasks, `join!`/`try_join!` for a known set, `select!` to race — and only race cancellation-safe futures.
- Clone `Arc` data *before* `.await` points so references don't span suspensions.
- Prefer native `async fn` in traits over `async_trait`.
- Graceful shutdown via `tokio_util::sync::CancellationToken`.

## Web frameworks

- **axum** (default, Tokio-native): routes as functions, extractors, middleware via `tower`/`Service`.
- **actix-web**: when you want the actor model and a battle-tested stack.
- **rocket**: ergonomic, but heavier and less async-native — reach for it only if the API surface fits.

Structure axum apps as: extractors (typed state `State<AppState>`, `Path`, `Query`, `Json`) → handlers returning `Result<impl IntoResponse>` → a shared error type.

## Data & SQL

- Prefer `sqlx` for compile-time-checked queries (`query!`) or query-building; it catches SQL/type mismatches at build time.
- Use a pool (`sqlx::PgPool`), never a new connection per request. Bound the pool size to DB capacity.
- Migrations: `sqlx migrate` (or `refinery`) — versioned, applied on deploy, never `CREATE TABLE` in app code.
- Return typed structs with `#[derive(sqlx::FromRow)]`; select only the columns you need (no `SELECT *`).
- Transactions: `&mut *tx` for a series of writes; `BEGIN`/`COMMIT` boundaries at the use-case, not the adapter.

## Layering & DI

- Domain: pure rules. Application: use-cases. Infrastructure: adapters. Depend inward; domain imports nothing from `sqlx`/`axum`.
- Inject dependencies as trait objects or generic `impl Repo`; don't hard-wire the DB client into domain logic.
- `AppState` holds `Arc`-wrapped pools/clients; handlers get it via `State<AppState>`.

## Observability & resilience

- `tracing` (+ `tracing-subscriber`) with `#[instrument]` on handlers; structured fields, not string interpolation.
- Timeouts on every outbound call (`tokio::time::timeout`, `reqwest::Client` with `.timeout`); retries with backoff (`tower::retry`, `backon`) only on idempotent ops.
- Graceful shutdown: catch SIGTERM/SIGINT, stop accepting, drain in-flight requests, then exit.
- Config via environment + `figment`/`config`; secrets from env, never committed.

## Testing

- Unit-test domain pure functions. Integration-test repositories with `sqlx::test` (or a testcontainers DB). Test handlers with `tower::ServiceExt::oneshot` against a router with mocked state.
