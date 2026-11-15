---
name: rust-distributed
description: Design distributed systems in Rust around the network's real failure model — partitions, duplicates, reordering, and timeouts that mean "unknown", not "failed". Covers idempotency keys and dedupe tables, at-least-once consumers, retry budgets with jitter, leases with fencing tokens, transactional outbox, sagas, per-key ordering, and when Raft (`openraft`, `raft-rs`) is actually warranted. Use when the user mentions distributed, consensus, raft, replication, leader election, idempotency, at-least-once, exactly-once, distributed lock, saga, outbox, partitioned, clock skew, or retry storm, or asks how to retry safely, how to avoid processing a message twice, or whether a distributed lock is needed.
---

# Distributed Systems

A **partition** is not an error path — it is normal operation. Messages are lost, duplicated,
reordered and delivered late; a timeout means *unknown*, never *failed*. Every guarantee below is
bought with a mechanism you write and test; "exactly-once" is a database constraint, not a transport.

## Route first

| Concern | Go to |
|---|---|
| The workflow for the service being written | `rust-skill` |
| Rule text: error types, spans, atomics, channels | `rust-skills` → `err-custom-type`, `obs-instrument-spans`, `obs-structured-fields`, `conc-atomic-ordering`, `async-cancel-safety`, `async-bounded-channel` |
| Transient vs permanent classification, `is_retryable()` | `rust-error-advanced` |
| Outbox tables, transactions, unique constraints, TTL cleanup | `rust-database` |
| Timeouts, cancellation, backpressure, worker topology | `rust-async`, `rust-async-pattern` |
| Single-writer state that never leaves one process | `rust-actor` |
| Locks, atomics, `Send`/`Sync` on shared state | `rust-concurrency` |
| Partitioned cache keys and stampedes, retry dashboards | `rust-cache`, `rust-observability` |
| Loom, property tests, fault-injection harnesses | `rust-testing` |

## Playbook

1. **Write the failure model before the diagram.** Every call has three outcomes: done, not done,
   unknown. Unknown is the default. *Done when* each call site answers "what if I never learn the
   outcome?" with something other than "assume it failed".
2. **Make every mutation idempotent at the origin.** One idempotency key per logical operation — not
   per message, not per attempt — generated before the first try and carried through every hop. The
   key row and the effect commit in one transaction; the dedupe TTL exceeds the maximum redelivery
   window. *Done when* replaying the same key twice produces one effect and the same response.
3. **Retry only classified-transient failures.** `rust-error-advanced` owns the `match`; this skill
   owns the budget. Capped exponential backoff with full jitter — `random(0, min(cap, base * 2^n))`
   — plus a per-dependency retry budget a breaker cuts when spent. *Done when* attempts, failures and
   rejections are one metric, and a test shows a storm absorbed rather than amplified.
4. **Give ownership a lease and a fence.** A distributed lock is a lease with an expiry, and a lease
   needs a monotonic fencing token; every write carries it and the resource rejects any token not
   greater than the highest it has seen. *Done when* a paused leader's delayed write is refused by
   the storage — its own clock is irrelevant.
5. **Choose the pattern from the requirement, not from taste.** Commit-then-publish is a
   transactional outbox with a relay, not a dual write. One effect across services is a saga whose
   compensations are themselves idempotent. *Done when* every cross-boundary effect names its pattern
   and the job that compensates or cleans up after it.
6. **Order per key, never globally.** Partition by entity id; treat per-key order as guaranteed and
   cross-key order as non-existent. Global order is a consensus problem, not a queue setting. *Done
   when* no handler depends on an ordering it did not pay for.
7. **Reach for consensus last.** `openraft` (async, Tokio) or `raft-rs` (TiKV's, more manual) buys
   leader election and a replicated log at the price of a majority quorum to write and a durable
   append per entry. Check current APIs before committing. *Done when* you can state what the
   cluster does in a minority partition and who loses writes.
8. **Propagate context, measure saturation.** Trace parent across every hop, one span per attempt,
   structured fields for key, attempt and outcome. *Done when* one trace shows the logical
   operation, each retry, and the dedupe decision.
9. **Test under a simulated network.** `turmoil` runs a Tokio app against deterministic partitions,
   delays and drops, seeded and reproducible. *Done when* a seeded partition test fails if the
   dedupe insert or the fence is removed.

## Examples

```rust
use sqlx::PgPool;

pub enum Outcome {
    Applied,   // first delivery
    Duplicate, // key already claimed
}

/// `key` identifies one logical operation, not one message and not one attempt.
pub async fn apply_payment(db: &PgPool, key: &str, amount_cents: i64) -> Result<Outcome, sqlx::Error> {
    let mut tx = db.begin().await?;

    // Claim the key and write the effect together: both commit, or neither does.
    let claimed = sqlx::query(
        "INSERT INTO processed (idem_key, seen_at) VALUES ($1, now()) ON CONFLICT (idem_key) DO NOTHING",
    )
    .bind(key)
    .execute(&mut *tx)
    .await?
    .rows_affected();

    if claimed == 0 {
        tx.rollback().await?; // a concurrent or replayed delivery already applied it
        return Ok(Outcome::Duplicate);
    }

    sqlx::query("INSERT INTO ledger (idem_key, amount_cents) VALUES ($1, $2)")
        .bind(key).bind(amount_cents).execute(&mut *tx).await?;

    tx.commit().await?;
    Ok(Outcome::Applied)
}
```

```rust
/// Monotonic per resource. The storage arbitrates ownership, not the worker's clock.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub struct FencingToken(pub u64);

/// `Ok(false)` means the token was stale: this worker lost the lease. Stop; never retry.
pub async fn write_with_fence(
    db: &PgPool, key: &str, token: FencingToken, value: &str,
) -> Result<bool, sqlx::Error> {
    let rows = sqlx::query("UPDATE resource SET value = $2, fence = $3 WHERE key = $1 AND fence < $3")
        .bind(key).bind(value).bind(token.0 as i64)
        .execute(db).await?.rows_affected();
    Ok(rows > 0)
}
```

## Hard rules

- A timeout is *unknown*: retry only idempotent work, and when the effect is not idempotent, read the
  outcome back before acting again.
- Dedupe lives in the same transaction as the effect; a cache or an in-memory `HashSet` is not a
  dedupe table.
- No lease without a fencing token, and no client-side check standing in for a server-side rejection.
- No unbounded retry: cap, jitter, budget, classify — an unclassified retry storm is self-inflicted
  load.
- Raft is for leader election and a replicated log. If you cannot name the minority-partition
  behaviour, you do not need it yet.

## Done when

- every mutating call path has an idempotency key and a dedupe row committed with its effect
- retries are `is_retryable()`-gated, jittered, capped, and counted against a per-dependency budget
- every lease write path passes a fencing token the storage validates
- a seeded `turmoil` test breaks when the dedupe insert or the fence is removed
