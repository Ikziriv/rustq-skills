# ERP / HMS domain architecture in Rust

An ERP or hospital system is not a web app with tables: it is a **ledger of irreversible
facts** (money moved, stock left the shelf, a patient was admitted, a period was closed)
with heavy batch computation on top. Optimise for correctness and auditability first,
throughput second, and only then for latency.

## 1. Shape: modular monolith first, services second

```
workspace/
  shared-models/        # pure domain: DTOs, invariants, pure engines. NO axum, NO sqlx*
  core-backend/         # axum: routing, auth, sqlx queries, transaction boundaries
  services/
    billing-processor/  # batch worker: pure engine + own I/O
    pos-terminal/       # edge, offline-capable
    device-bridge/      # serial/TCP adapters
  platform/service-kit/ # shared runtime: config, tracing, db pool, error mapping
  frontend-leptos/      # SSR + hydration; consumes shared-models
  migrations/           # schema is a reviewed artifact, not a side effect
```

Rules that keep this sane:

- `shared-models` is the **contract**: `serde` + domain logic only. It compiles to
  `wasm32` for the frontend, so nothing server-only (rayon, sqlx, tokio) may be a default
  dependency — put them behind optional features (`ssr`, `parallel`).
- One crate per deployable unit, one module per *business capability* (not per type):
  `payroll`, `billing`, `pharmacy`, `warehouse`.
- A new feature is a module in the monolith until it has a *different* scaling or release
  cadence. Extracting later is cheap; debugging a distributed transaction is not.

## 2. Functional core, imperative shell

Every calculation that a human will dispute (tax, BPJS, depreciation, discounts, stock
valuation, billing splits) belongs in a **pure function over plain data**:

```rust
// pure: no clock, no DB, no logging, no allocation-heavy IO
pub fn compute(&self, employee: &EmployeeCalc) -> Vec<CalcLine>;

// shell: fetch effective-dated config, resolve ids, run in a transaction
let rules = load_rules(&mut tx, period_end).await?;
rules.validate()?;                            // fail the batch, don't under-withhold
let lines = rules.compute(&employee);
```

Benefits that compound: unit tests become golden-value tables from the regulation;
`criterion` benchmarks are possible; the same code runs in the frontend preview and in
the batch worker; and a reviewer can diff the implementation against the regulation text.

## 3. Money, quantities, and rounding

- **Never `f64`** for money. `rust_decimal` for domain maths (percentages, tax layers),
  `NUMERIC(18,4)` in Postgres, `i64` minor units only where you control both ends
  (POS totals, currency-exact aggregations).
- **Decide the rounding boundary once, per document type, and write it in a doc comment.**
  Per line then sum ≠ sum then round. Tax law usually prescribes per-obligation rounding.
  For Indonesia, PPh21 PKP is floored to full thousands; BPJS contributions round to the
  rupiah — encode both, do not let them drift per call site.
- Wrap money in a newtype when a module handles several currencies or kinds:
  `struct Rupiah(Decimal)` / `struct Quantity(Decimal)`; it prevents
  `wage_cap * hours` compiling.
- Aggregates must be **exactly** reproducible: use `Decimal`/integer accumulation, never
  float sums in a parallel reducer, and keep the summation order in a golden test.

## 4. Effective-dated configuration (the ERP-specific killer)

Tax rates, BPJS caps, price lists, COA mappings, discount rules, approval matrices all
change over time and must be reproducible for historical documents.

- Store rows with `effective_from` / `effective_to` and resolve **once per document**:
  "which rules apply to period_end 2025-12-31".
- Resolve into a compiled struct (`RuleIndex`) **once per batch**, not per row.
- `validate()` the resolved set (non-empty, ascending, in-range) and fail loudly.
- **Snapshot the resolved numbers into the posted document**, not only the FK. If a rate
  row is corrected next year, the posted slip must not change.
- Add a golden test per regulation revision: a new fixture, the same engine.

## 5. Transactions, idempotency, immutability

- One aggregate = one transaction boundary. A payroll run is *not* one transaction; it is
  many idempotent per-employee transactions plus a run record.
- Every externally-triggered mutation carries an **idempotency key** (`(run_id, employee_id)`,
  `(terminal_id, local_seq)`). `ON CONFLICT DO NOTHING` + "already processed" is a valid,
  boring answer.
- Posted entries are immutable: corrections are **reversals**, never `UPDATE price`. Keep
  `created_by`, `created_at`, `source_doc_id`, `reason` on the row.
- Enforce double-entry as a checked invariant at commit:
  `assert!(sum(debits) == sum(credits))` in the posting function, plus a DB constraint or a
  nightly verification query — the invariant is the product.
- Period close: an advisory lock (or a `status` row with optimistic version) per period;
  reject posting into a closed period at the repository boundary, not at the UI.

## 6. Concurrency

- Optimistic concurrency (`version` column, `WHERE version = $1`) for editable master data.
- `SELECT ... FOR UPDATE` only on the row you are mutating, inside the transaction, never
  across an `.await` on unrelated I/O.
- Sequences for journal/document numbers; if gapless numbering is a legal requirement, use
  a counter row with `FOR UPDATE` and accept the contention — say so in a comment.
- Never hold a lock while calling an external service (SatuSehat/BPJS/payment gateway).
  Persist "pending", return, and reconcile from a webhook.

## 7. Batch and reporting

- Chunk the batch (500-2 000 rows), commit per chunk, record progress in a run table, and
  make re-running the same chunk a no-op (idempotency again).
- Aggregate in SQL when the DB can do it (indexes, `GROUP BY`), in Rust when the rule is
  business logic (tax layers, proration). Do not ship 500k rows to Rust to sum them.
- Stream responses for exports: `futures::stream` + CSV writer, not `Vec<Row>` then serialize.
- Cursor (keyset) pagination on `(created_at, id)`; `OFFSET` dies at 100k rows.
- The pure engine can then run in parallel (`rayon` fold/reduce) once it allocates nothing
  per row — see `hotpath-optimization.md`.

## 8. Offline / edge (POS, wards, clinics)

- Local SQLite (or an embedded KV) with the same domain types (`shared-models`).
- An **outbox**: every local mutation appends to `outbox(local_seq, payload)`; the sync
  worker drains it in order with retries. Server accept = `ON CONFLICT DO NOTHING` on
  `(terminal_id, local_seq)`.
- Client-generated ids (UUIDv7) so records created offline keep their identity.
- Define conflict policy per entity up front: server-wins, client-wins, or merge (never
  "last write wins" on money).

## 9. Security and audit in an ERP

- Authorize on the **server**, per capability, not per route name. Check the scope
  (unit/warehouse/doctor) in the query, not in the UI.
- Audit trail is an append-only table written in the same transaction as the mutation, with
  actor, before/after (redacted), and request id.
- Never log PII or secrets; redact at the `tracing` field level.
- Validation at the boundary: `serde` + `TryFrom<Raw>` into a validated newtype
  (parse, don't validate) so an invalid state cannot be constructed.

## 10. Performance budget for an ERP

Derived from what operators feel, not from microbenchmarks:

| Path | Budget |
|---|---|
| Document save / post | < 300 ms p95 (one aggregate, one tx) |
| List/report page | < 500 ms p95 (indexed, keyset paginated) |
| Payroll run, 1 000 employees | < 5 s end-to-end (engine < 2 ms/employee) |
| Nightly reconciliation | Overnight; streamed, chunked, restartable |
| Frontend first paint (wasm) | < 200 KB brotli initial payload |

Instrument the batch paths from day one: per-phase timings in `tracing` spans, row counts,
retry counts. A payroll run that silently takes 40 minutes is a production incident.

## 11. Testing an ERP

- **Golden tables** from the regulation: input → expected rupiah. One test per worked
  example in the law, named after its article.
- **Property tests** for invariants: `debits == credits`, `net = gross - deductions`,
  `year_total == sum(months)`, idempotent re-run produces no new rows.
- **Boundary tests** for every inclusive/exclusive edge (bracket upper bound, cap,
  rounding to thousands).
- **Equivalence tests** when replacing an algorithm (see `hotpath-optimization.md`).
- **Snapshot tests** (insta) for serialized documents/PDF inputs — cheap, and they catch
  accidental field renames across the wasm boundary.

## Review checklist for an ERP domain function

- [ ] Pure: no clock, no DB, no `rand`, no globals — everything comes in as an argument.
- [ ] Money is `Decimal` (or integer minor units) with an explicit rounding policy.
- [ ] Rules are resolved once per document/batch and snapshotted into the output.
- [ ] Returns `Result` with a typed error; validation failure fails the batch.
- [ ] No `unwrap`/indexing on a data path; no silent `unwrap_or(ZERO)` that hides a
      missing rate table.
- [ ] Output ordering is deterministic (it ends up in a PDF and in tests).
- [ ] Allocation-free per row, or explicitly documented as IO/DB-bound.
- [ ] Golden + equivalence + boundary tests cover the regulation's examples.
- [ ] Idempotent: running it twice produces the same rows, not twice the money.

## See Also

- `hotpath-optimization.md` — make the pure engine fast, in the right order.
- `patterns.md` — typestate/newtype/parse-don't-validate used by the domain types.
- `backend.md` — axum/sqlx transaction and layering patterns.
- `wasm.md` — keeping the shared crate wasm-clean and small.
