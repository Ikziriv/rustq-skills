# Rules Digest

Quick reference for constructs the core and branch files don't cover. Each line is the rule → the action.

## Numeric & arithmetic safety

- Overflow: handle explicitly with `checked_`/`saturating_`/`wrapping_`/`overflowing_` — never rely on silent wrapping.
- Casts: widen with `From`, narrow with `TryFrom`; avoid `as` for narrowing (it truncates silently).
- Floats: never compare with `==` — use a tolerance, and `total_cmp` for ordering.
- Bounds: `clamp` and saturating arithmetic to pin values in range.
- `NonZero*` types forbid zero and unlock the niche optimization (e.g. `Option<NonZeroU8>` is one byte).

## Serde

- `#[serde(rename_all = "...")]` to match the external naming convention.
- `#[serde(default)]` for optional/backward-compatible fields.
- `skip_serializing_if` to omit empty fields.
- `#[serde(flatten)]` to inline nested structs or capture extra keys.
- Choose enum tagging deliberately: externally, internally, adjacently tagged, or untagged.
- `#[serde(deny_unknown_fields)]` to reject unexpected keys.
- `with` / `serialize_with` / `deserialize_with` for per-field customization.
- `#[serde(try_from = "Raw")]` to validate while deserializing.

## Type safety

- `PhantomData` to express type relationships with no runtime cost.
- The never type `!` for functions that diverge.
- `#[repr(transparent)]` for newtypes in FFI contexts.
- `Deref`/`DerefMut` only for smart pointers and transparent wrappers.
- `Display` for user-facing output, `Debug` for diagnostics — never swap them.

## Testing

- Unit tests in `#[cfg(test)] mod tests` with `use super::*;`; integration tests in `tests/`.
- Descriptive names; Arrange/Act/Assert structure.
- `proptest` for property-based testing; `mockall` (and traits as seams) for mocks.
- `#[tokio::test]` for async; `#[should_panic]` for expected panics.
- `criterion` for benchmarks; doctests as executable examples.
- `loom` to exhaustively test concurrency; `insta` for snapshots.

## Macros

- Reach for a macro only when a function or generic can't express it.
- Rely on `macro_rules!` hygiene and `$crate` paths.
- Capture with precise fragment specifiers, not raw `:tt`, where possible.
- `#[macro_export]` for declarative macros; hide helpers behind `#[doc(hidden)] pub mod __private`.
- Proc-macros in a dedicated `proc-macro = true` crate built with `syn`/`quote`; report spanned compile errors, never panic.

## Const & compile-time

- Inline `const { }` blocks for compile-time evaluation and assertions.
- Make functions `const fn` when they can run at compile time.
- Const generics `<const N: usize>` to parameterize over values.
- `const` for an inlined value, `static` for a single addressed instance.

## Collections

- `BinaryHeap` for priority queues / repeated max-extraction.
- `HashMap` (unordered) / `BTreeMap` (sorted, range queries) / `IndexMap` (insertion order).
- `Vec` by default; `VecDeque` for queue/deque; avoid `LinkedList`.
- `HashSet`/`BTreeSet` for membership/dedup, not `Vec::contains`.

## Naming

- `UpperCamelCase` types/traits/variants; `snake_case` fns/vars/modules; `SCREAMING_SNAKE_CASE` consts.
- Short lifetimes (`'a`, `'de`, `'src`); single uppercase type params (`T`, `E`, `K`, `V`).
- `as_` = free reference conversion, `to_` = expensive/allocating, `into_` = consuming.
- No `get_` prefix; `is_`/`has_`/`can_`/`should_` for bools.
- `iter()`/`iter_mut()`/`into_iter()` consistently; acronyms as words (`HttpServer`, not `HTTPServer`).

## Clippy & linting

- `#![deny(clippy::correctness)]`; enable `suspicious`, `style`, `complexity`, `perf`.
- `pedantic` and `nursery` selectively, not the whole group.
- Warn on missing docs for public items; require docs for `unsafe` blocks.
- `cargo fmt --check` in CI; configure lints at workspace level.
- Enable `unexpected_cfgs` and declare known cfgs to catch feature-gate typos.

## Observability

- `tracing` over `println!`/bare `log`; structured key-value fields, not interpolated strings.
- Libraries emit through the tracing/log facade and never install a subscriber.
- `#[tracing::instrument]` on handlers/spans; filter levels with `EnvFilter`/`RUST_LOG`.
- Log each error once with its full source chain; never log secrets or PII.

## Compiler optimization (beyond profile flags)

- `#[inline]` small hot fns; `#[inline(always)]` only profiled; `#[inline(never)]`/`#[cold]` for error paths.
- `lto`, `codegen-units = 1`, PGO, and `target-cpu = native` for fixed deployment targets.
- Use iterators/patterns that elide bounds checks in hot paths.
- Portable SIMD for vectorized ops; cache-friendly data layout.

## Memory optimization (beyond allocation basics)

- `SmallVec` for usually-small collections; `ArrayVec<T, N>` for fixed-capacity, never-heap.
- Box large enum variants to shrink the enum's footprint.
- `clone_from` to reuse the destination's allocation; clear and reuse collections in loops.
- Arena allocators for batch allocations; zero-copy with slices and `Bytes`.
- Compact string types; appropriately-sized integers.
- `mem::take`/`mem::replace` to move out of `&mut` without cloning.
- Know drop order: struct fields top-to-bottom, locals in reverse.
