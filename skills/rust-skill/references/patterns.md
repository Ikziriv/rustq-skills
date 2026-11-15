# Rust Design Patterns & Abstractions

## Ownership & borrowing patterns

- **Borrow, don't clone.** Accept `&T`/`&mut T`. Only clone at boundaries where ownership must transfer, and make that explicit in the API name.
- **`Cow<'a, str>`** for "borrow or own": parameters that usually receive borrowed data but must sometimes return owned.
- **Newtype pattern.** Wrap a primitive (`struct UserId(u64)`) to give type-level guarantees and prevent mixing ids of different entities.
- **Builder pattern** for types with many optional fields, so constructors stay ergonomic and defaultable (`derive_builder`).
- **Typestate.** Encode state in the type so invalid transitions are unrepresentable: `Connection<Closed>`, `Connection<Open>`, with methods consuming `self` to move between states.

### Who needs access to this value?

| Need | Reach for |
|---|---|
| One owner, read-only borrows | plain `&T` / `&mut T` |
| Shared, single-threaded | `Rc<T>`; add `RefCell<T>` for interior mutation |
| Shared across threads | `Arc<T>` + `Mutex`/`RwLock` |
| Conditional ownership | `Cow<'a, T>` |
| Move a value out of `&mut` without cloning | `mem::take` / `mem::replace` |

### Argument shape

- Slices, not vecs: `&[T]` not `&Vec<T>`; `&str` not `&String`.
- Read-only: `&T` / `AsRef<T>`.
- Small cheap types → `Copy`; large types → move (or `Box` if moves are expensive).

### Rust 2024 notes

`extern` blocks are `unsafe extern { }` with per-item `safe`/`unsafe`; `#[unsafe(no_mangle)]`, `#[unsafe(export_name = "...")]`, `#[unsafe(link_section = "...")]` — not the bare attribute forms.

## Trait & abstraction patterns

- **Small traits.** One responsibility per trait; consumers depend on the smallest interface they need. Accept interfaces, return structs.
- **`From`/`TryFrom`** for fallible conversions; implement `AsRef`/`Borrow` for cheap references. `Into` is auto-derived from `From`.
- **Extension traits.** Add methods to foreign types via a local trait (`impl StrExt for str`) instead of wrappers.
- **Return-position `impl Trait`** for opaque, zero-cost returns; `Box<dyn Trait>` only for heterogeneous or recursive values.
- **Marker traits** (`Send`, `Sync`, `Copy`, `Clone`) and auto traits communicate contracts — respect them; don't blanket-`unsafe impl`.
- **Enum dispatch over dyn.** A closed set of variants is an `enum` with `match`; only an open, third-party-extensible set needs `dyn Trait`.

## Error-handling patterns

- One error enum per crate; `thiserror` derive with `#[from]` to chain sources; `#[source]` to mark causes.
- Context at the boundary, not the leaf: `.with_context(|| format!("failed to load config from {}", path))`.
- Distinguish "recoverable" (return `Result`) from "programmer error" (only in tests/provable invariants).
- For optional chains, `Option` with `?` and `.map`/`.and_then` beat nested `match`.

## Concurrency patterns

- **Message passing** for coordination: workers own state, receive commands via channel, reply via oneshot. No shared mutable state to lock.
- **Scoped threads** (`std::thread::scope`) to borrow stack data across threads without `'static`/`Arc`.
- **`Arc<Mutex<T>>`** for shared state; minimize the critical section — compute outside the lock, assign inside.
- **`RwLock`** read-heavy, **`Mutex`** write-heavy; `parking_lot` variants for lower contention overhead.
- **Atomics** for counters/flags; use `Ordering` deliberately (`Relaxed` for counters, `Acquire`/`Release` for happens-before) — don't default to `SeqCst`.
- **Bounded channels for backpressure**: `tokio::sync::mpsc` bounded channels enforce flow control; unbounded channels hide memory blowups.

## Application layering (domain / application / infrastructure)

Strictly separate:

- **Domain**: pure types + business rules, no I/O, no framework types.
- **Application**: use-cases orchestrating domain via repository/trait interfaces.
- **Infrastructure**: `sqlx`/`reqwest`/`redis` adapters implementing the repository traits.

Depend inward: infrastructure → application → domain. Domain must not import `sqlx` or `axum`.
