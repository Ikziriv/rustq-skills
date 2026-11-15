---
name: rust-cache
description: Design Redis caching in Rust services — key namespacing, TTL policy, cache-aside reads, invalidation on write, stampede control, and serialization. Use when the user mentions cache, Redis, TTL, invalidation, cache-aside, stampede or thundering herd, hot keys, key design, or cache serialization; or asks why stale data appears, where to cache a query, or how to make a cache safe to lose.
---

# Redis Caching

A cache is **disposable**: the system must be correct when the keyspace is deleted and fast when it
is not. Anything that cannot survive `FLUSHALL` is not a cache, it is a database you forgot to back
up.

Redis holds no authoritative state here. Every design question resolves to "who owns the truth, and
how old may a copy be".

## Route first

| Concern | Go to |
|---|---|
| Rule text for serialization, async, observability | `rust-skills` (`serde-*`, `async-*`, `obs-*`) |
| The workflow for the service holding the cache | `rust-skill` |
| The source of truth: queries, pooling, transactions | `rust-database` |
| The endpoint that reads through the cache | `rust-web` |
| Moving refresh work off the request path | `rust-actor` |
| Timeouts, retries, circuit breaking on Redis calls | `rust-async` |
| Caching auth lookups, session or token data | `rust-auth` |
| Timeouts, body limits and other edge layers | `rust-middleware` |
| Serialization cost per call | `rust-performance` |

## Playbook

1. **Justify the cache with two numbers.** The measured cost of the read you are avoiding, and the
   acceptable staleness in seconds. *Done when* both numbers are written down, or the cache is
   dropped.
2. **Own the key space.** `app:entity:v1:{id}` — namespace, version, no secrets, bounded length,
   built by exactly one function. *Done when* every key the service writes can be derived from that
   builder, and nothing calls `KEYS *` outside a test.
3. **Read cache-aside.** `GET` → on miss load from the source → `SET` with a TTL → return. The read
   path never trusts a cached value it cannot decode. *Done when* hit and miss return the same type
   from the same function, and a decode failure is treated as a miss.
4. **Invalidate after the write commits.** `DEL` in the same use case that mutated the source, after
   the transaction commits, never before. *Done when* each mutation has a matching delete, or a
   documented staleness window where TTL alone is acceptable.
5. **Bound the stampede.** Jitter TTLs, and on miss use a short `SET key … NX PX` lease so one
   caller loads while the rest briefly wait or serve stale. *Done when* a burst of concurrent misses
   produces a bounded number of source loads.
6. **Make Redis failure non-fatal.** Short connect/read timeouts, log and fall through to the source.
   *Done when* killing Redis leaves the service answering from the source with no 5xx.
7. **Serialize one way and version it.** JSON when humans will read it, a compact binary format when
   size matters (`serde-enum-representation` for tagged shapes). *Done when* a payload written by
   the previous release still decodes, or is cleanly discarded as a miss.

## Examples

```rust
use redis::AsyncCommands;

async fn load_user(
    conn: &mut deadpool_redis::Connection,
    repo: &UserRepo,
    id: UserId,
) -> Result<User, AppError> {
    let key = user_key(id); // one builder: "app:user:v1:{id}"

    match conn.get::<_, Option<Vec<u8>>>(&key).await {
        Ok(Some(bytes)) => match serde_json::from_slice::<User>(&bytes) {
            Ok(user) => return Ok(user),
            Err(err) => tracing::warn!(?err, key = %key, "stale payload, treating as miss"),
        },
        Ok(None) => {}
        Err(err) => tracing::warn!(?err, key = %key, "cache read failed"), // fast path only
    }

    let user = repo.by_id(id).await?; // the source of truth decides success
    if let Ok(bytes) = serde_json::to_vec(&user) {
        if let Err(err) = conn.set_ex::<_, _, ()>(&key, bytes, ttl_with_jitter()).await {
            tracing::warn!(?err, key = %key, "cache write failed");
        }
    }
    Ok(user)
}
```

```rust
use redis::AsyncCommands;

// Invalidation lives in the use case that wrote: commit first, then delete.
async fn rename_user(
    conn: &mut deadpool_redis::Connection,
    repo: &UserRepo,
    id: UserId,
    name: &str,
) -> Result<(), AppError> {
    repo.update_name(id, name).await?; // commit the source of truth
    if let Err(err) = conn.del::<_, ()>(user_key(id)).await {
        tracing::warn!(?err, "cache invalidation failed; TTL is the fallback");
    }
    Ok(())
}
```

The `redis` and `deadpool-redis` client APIs have changed across recent releases (`AsyncCommands`
bounds, `Config::create_pool` signature, pooled connection types) — check current docs before
copying these shapes into a manifest you have not compiled.

## Hard rules

- TTL is not invalidation: an expiring key still serves stale data for its whole TTL.
- Delete after the source write commits; deleting first lets a racing reader re-populate the old
  value.
- Never cache an authorization decision, a token, or anything whose staleness is a security bug.
- The cache never decides success: if Redis is down or slow, answer from the source.
- One key builder, one namespace and one payload version per shape — no ad-hoc `format!` at call
  sites, and no `KEYS *` against a shared instance (use `SCAN` in tooling).

## Done when

- deleting the whole keyspace changes latency, never responses
- every mutation either deletes its keys or documents the staleness window it accepts
- a burst test shows a bounded number of source loads during a miss storm
- Redis unavailable produces no 5xx on cached endpoints
