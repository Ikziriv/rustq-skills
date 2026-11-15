---
name: rust-coding
description: Rust coding standards — naming, module and crate layout, public API conventions, rustfmt, Clippy lint configuration, and doc requirements. Use when the user mentions style, naming, conventions, clippy, rustfmt, module layout, API conventions, or lints, or asks how to organize a crate, how to configure workspace lints, or how to review Rust code for house style.
---

# Rust Coding Standards

**Consistency** beats personal preference. A codebase that names and arranges things one way costs less to change than one where every module is idiomatic in its own dialect.

Apply these as the default, deviate only where neighbouring code already deviates, and never reformat code you were not asked to touch.

## Route first

| Task | Go to |
|---|---|
| Rule text for `name-*`, `proj-*`, `api-*`, `lint-*`, `doc-*`, `type-*` | `rust-skills` |
| End-to-end write / review workflow, per-domain references | `rust-skill` |
| Whether a parameter should borrow, clone, or take ownership | `rust-ownership` |
| Error enum shape, `thiserror` vs `anyhow`, context chains | `rust-error` |
| Flagging design defects in code that already exists | `rust-anti-pattern` |
| Changes that must not regress a hot path | `rust-performance` |
| Layer and handler conventions in a service | `rust-web` |
| Public `unsafe` API surface | `rust-unsafe` |

## Playbook

1. **Read before prescribing.** Sample three neighbouring modules and the crate root. If the repo already answers a style question, adopt its answer. *Done when* your proposed convention already appears in two places, or you have written one sentence explaining why it deviates.
2. **Name to the std contract.** Types and variants `UpperCamelCase`, functions/methods/locals `snake_case`, consts `SCREAMING_SNAKE_CASE`; booleans read as `is_*`/`has_*`; no `get_` prefix; acronyms and numbers stay words (`HttpUrl`, not `HTTPURL`). Conversion prefixes carry meaning: `as_` = cheap borrow/cast, `to_` = copies or allocates, `into_` = consumes, `from_` = constructor. Rules: `name-funcs-snake`, `name-types-camel`, `name-consts-screaming`, `name-is-has-bool`, `name-no-get-prefix`, `name-to-expensive`, `name-into-ownership`, `name-acronym-word`. *Done when* every changed public item passes all eight checks.
3. **Lay out by feature, not by kind.** One module per concept, its type plus its impls plus its tests together (`proj-mod-by-feature`); `foo.rs` + `foo/` over `foo/mod.rs` (`proj-mod-rs-dir`); `lib.rs`/`main.rs` split so logic is testable (`proj-lib-main-split`); re-export the intended surface from `lib.rs` (`proj-pub-use-reexport`). *Done when* no module exists solely to hold "all the structs".
4. **Default to `pub(crate)`.** `pub` is a maintenance promise, so widen only when an external caller exists (`proj-pub-crate-internal`). New public enums/structs get `#[non_exhaustive]` (`api-non-exhaustive`); pure or chainable methods whose return value is the point get `#[must_use]` (`api-must-use`); accept `&str`, `&[T]`, or `impl AsRef<Path>` and return owned values only when the caller must outlive the input; implement `From`, not `Into` (`api-from-not-into`, `api-impl-asref`); put invariants in a validated newtype so invalid states cannot be constructed (`api-parse-dont-validate`, `api-newtype-safety`, `type-newtype-ids`). *Done when* every changed signature can be called by a caller that never clones to satisfy it.
5. **Configure lints once.** Workspace root holds `[workspace.lints]`, every crate opts in with `[lints] workspace = true` (`lint-workspace-lints`). Deny `correctness` and `suspicious`, warn `style`/`complexity`/`perf` (`lint-deny-correctness`, `lint-warn-perf`); add pedantic and restriction lints individually, not by whole category (`lint-pedantic-selective`, `lint-missing-docs`). *Done when* a new crate is covered without editing its own manifest beyond the two lines.
6. **Document the contract, not the mechanics.** Every public item gets a doc comment; crate root gets `//!` with a runnable example (`doc-all-public`); fallible functions get `# Errors`, panicking ones `# Panics`, `unsafe` ones `# Safety`; link types instead of naming them (`doc-intra-links`). *Done when* `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps` passes and no doc restates the body.
7. **Format with the tool, not by hand.** `cargo fmt` decides layout; `rustfmt.toml` is a team decision, committed once (`lint-rustfmt-check`). A `#[rustfmt::skip]` needs a reason on the same line. *Done when* `cargo fmt --check` is clean.

```rust
/// Strong ID: a bare `u64` cannot be passed where a `UserId` is expected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct UserId(u64);

impl Config {
    /// Consuming builder: `#[must_use]` makes a dropped result a warning.
    #[must_use]
    pub fn with_retries(mut self, retries: u32) -> Self {
        self.retries = retries;
        self
    }
}

/// Borrow wide, own late: `&str` in, `String` only because the caller needs one.
#[must_use]
pub fn normalize_name(raw: &str) -> String {
    raw.trim().to_lowercase()
}
```

## Hard rules

- A lint `allow` sits on the item it silences, with a reason; never widen it to a module or the workspace.
- `pub` only with an external caller; `pub(crate)` is the default answer.
- Conversion prefixes are the API's cost contract: `as_` is a cheap borrow or cast, `to_` allocates, `into_` consumes. Callers trust them, so pick the one that matches the work.
- Never reformat unrelated code to make `cargo fmt --check` pass; fix the file you changed.
- Every lint level change is a separate commit, so it can be reverted without touching logic.

## Done when

- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps` all pass.
- Every changed public item has docs plus a recorded `#[must_use]` / `#[non_exhaustive]` decision.
- No new `#[allow]` appears without an adjacent justification.
- The layout and naming of the touched module matches its neighbours, not a style guide the crate never adopted.
