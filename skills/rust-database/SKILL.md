---
name: rust-database
description: Database access from Rust — choose sqlx, diesel or sea-orm by query shape and team, size the pool, draw transaction boundaries at the use case, and keep migrations forward-only. Use when the user mentions sqlx, diesel, sea-orm, postgres, sqlite, mysql, query, transaction, migration, connection pool, deadlock, N+1, pagination, or prepared statements; or asks where a query belongs, why a transaction deadlocks, why a pool saturates, or how to change a schema without downtime.
---

# Database & ORM

The database is a second failure domain: it can be slow, it can deadlock, and it can enforce a
constraint the code forgot. **Leading word: boundary.** The boundary is the transaction — what must
commit together. Pool size, isolation level, and error mapping are all consequences of where you
draw it.

## Route first

| Concern | Go to |
|---|---|
| Rule text: `async-*` (`async-no-lock-await`, `async-spawn-blocking`), `err-*` (`err-thiserror-lib`, `err-from-impl`), `serde-*`, `obs-*` | `rust-skills` |
| Layering, and where the use case lives | `rust-skill` |
| Mapping a DB failure to an HTTP status and body | `rust-web` |
| Designing the error enum, `#[from]` vs context | `rust-error` |
| Caching reads, invalidating on write | `rust-cache` |
| Query spans, slow-query logs, pool metrics | `rust-observability` |
| A connection or transaction held across `.await` | `rust-concurrency` |
| Statement cost, row decoding, batching | `rust-performance` |
| Schema-level tests, `#[sqlx::test]` fixtures | `rust-testing` |
| Session, token and key-hash tables | `rust-auth` |

## Playbook

1. **Pick the mapper from the query shape and the team, in writing** — table below. *Done when*
   the choice names the check it buys (build-time column types, a typed DSL, relation mapping) and
   the CI dependency it adds (a database at build time, `.sqlx/` committed, a container).
2. **One pool per process, built once and cloned cheaply.** Every mapper's pool is a `Clone` handle
   over an `Arc`: clone it into handlers, never open one per request. Bound it before thinking of
   throughput: instances × pool size stays under the server's `max_connections` minus headroom for
   migrations and an operator session; `acquire_timeout` sits below the request timeout so
   saturation fails fast. *Done when* both numbers are literals in config, arithmetic commented.
3. **One transaction per use case, opened by the use case.** `pool.begin()`, pass `&mut *tx` as the
   executor, `commit()` explicitly — dropping the guard rolls back, so an early `?` cannot leave a
   half-applied write. *Done when* one command's writes share a `tx` and no `tx` wraps a remote call.
4. **Name the anomaly the transaction prevents, and the isolation level it assumes.** Read
   Committed lets two read-modify-writes interleave; close it with an atomic `UPDATE ... SET x =
   x + $1`, `SELECT ... FOR UPDATE`, or a unique constraint. Serializable only with retry on
   `40001`. *Done when* each transaction names lost update, write skew, or phantom, and its defence.
5. **Retry only what is safe to retry, and replay the whole unit of work.** A serialization failure
   (`40001`) or deadlock victim (`40P01`) re-runs the transaction from the top, with jitter and a
   bounded attempt count; anything else is a bug or a constraint decision. *Done when* the loop
   matches specific SQLSTATEs, and a blind retry of a write is impossible by construction.
6. **Migrations are forward-only, checked in, and applied at deploy.** Never edit a file that has
   run anywhere. Expand, then contract: add a nullable column, write both shapes, backfill in
   batches, add the constraint, and drop the old column only in a later release — after no deployed
   code reads it. *Done when* `migrate` applies clean to an empty database and to a restored
   production copy, and no release both removes a column and stops using it.
7. **Translate constraint violations once, in the adapter.** Uniqueness and foreign keys are
   decisions the domain wants as variants, not driver errors. *Done when* no `sqlx::Error` or
   `diesel::result::Error` appears in a domain or handler signature.
8. **Treat statement count per request as a budget you assert.** Load children with one
   `WHERE id = ANY($1)` (or a join) and stitch in a `HashMap`; insert batches with multi-row `VALUES`
   or `UNNEST($1::int[], $2::bigint[])`, chunked under the bind-parameter cap. *Done when* a list
   endpoint's statement count is constant in the rows returned, and a hundred-row write is one trip.
9. **Page by keyset, and keep the statement cache honest.** `WHERE (created_at, id) < ($1, $2)`
   with a composite index matching the `ORDER BY` is flat at any depth; `OFFSET` re-reads every
   skipped row and repeats rows when data shifts. Connections cache prepared statements, so behind a
   transaction-mode pooler (PgBouncer) that cache must be off or statements vanish mid-session —
   check current docs for the knob. *Done when* paging cost is flat and the pooler mode is recorded.
10. **Test against the same engine and version.** `#[sqlx::test]` provisions a database per test and
    applies `migrations/`; a container is the fallback for diesel and sea-orm. *Done when*
    repository tests share no state and pass in parallel.

| Situation | Pick | Cost you accept |
|---|---|---|
| SQL is reviewed as SQL; column types must match the schema at build time | `sqlx` + `query!` / `query_as!` | a reachable database at build time, or `.sqlx/` committed |
| Schema modelled as Rust types, joins composed, no database in CI | `diesel` | blocking: an `r2d2` pool per thread, or `spawn_blocking` |
| Entity graph with relations, async, less SQL written by hand | `sea-orm` | weakest compile-time checking — read the SQL it emits |
| One hot query, no mapper wanted | `tokio-postgres` | column names, indexes and types are all yours to track |

Every API named above has moved within recent major lines — offline `query!` mode, pool builder
knobs, diesel's `r2d2` integration, sea-orm codegen. Check current docs, not a blog post.

## Examples

```rust
// One boundary per use case: both writes commit together, and dropping `tx` without
// `commit()` rolls back — an early `?` cannot leave a half-applied transfer.
let mut tx = self.pool.begin().await?;
sqlx::query!("UPDATE accounts SET balance = balance - $1 WHERE id = $2", cents, from)
    .execute(&mut *tx)
    .await?;
sqlx::query!("UPDATE accounts SET balance = balance + $1 WHERE id = $2", cents, to)
    .execute(&mut *tx)
    .await?;
tx.commit().await?;
```

```rust
// The adapter is the only layer that knows SQLSTATE; the domain gets a decision.
fn map_error(err: sqlx::Error) -> RepoError {
    let code = err.as_database_error().and_then(|db| db.code()).map(|c| c.into_owned());
    match code.as_deref() {
        Some("23505") => RepoError::AlreadyExists, // unique_violation
        Some("23503") => RepoError::MissingParent, // foreign_key_violation
        _ => RepoError::Other(err),
    }
}
```

```rust
// Keyset paging: constant cost at any depth, and no row appears twice across pages.
let rows: Vec<EventRow> = sqlx::query_as(
    "SELECT id, created_at FROM events WHERE (created_at, id) < ($1, $2)
     ORDER BY created_at DESC, id DESC LIMIT $3",
)
.bind(cursor.created_at)
.bind(cursor.id)
.bind(limit)
.fetch_all(&self.pool)
.await?;
```

## Hard rules

- A pooled connection or transaction never outlives the function that opened it, and never stays
  alive across an `.await` that calls another service.
- No `SELECT *` where the rows shape a response: list columns, so a migration cannot silently
  change a payload's type.
- Bind every value; a query builder may compose structure, never concatenate input.
- Never edit a migration that has run anywhere — fix forward, idempotently.
- A write outside a transaction has a comment saying why a single statement is sufficient.

## Done when

- pool size × instance count < server `max_connections`, and `acquire_timeout` < request timeout
- exactly one transaction per use case, and no driver error type escapes the adapter
- list endpoints page by keyset and have a statement-count test
- migrations apply clean to an empty database and to a production snapshot
