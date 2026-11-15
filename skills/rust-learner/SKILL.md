---
name: rust-learner
description: Track Rust releases, editions and language change — what a new toolchain, release note, RFC or deprecation means for this codebase. Use when the user mentions Rust version, toolchain, edition 2024, MSRV, release notes, changelog, RFC, tracking issue, stabilization, deprecation, migration, or "what changed"; or asks whether they can upgrade, which feature is stable on which channel, or how to move a crate to a newer edition.
---

# Rust Learning & Version Tracking

The unit of work is a **delta**: what changed, whether it reaches this codebase, and what it costs
here. "Latest" is not a goal — a pinned, justified toolchain is.

Release cadence and edition policy are stable facts; anything version-specific belongs to the
release notes for the toolchain in `Cargo.toml`. Verify there before quoting a number.

## Route first

| Concern | Go to |
|---|---|
| Rule text for declared MSRV, workspace deps, lint config | `rust-skills` (`proj-msrv-declare`, `proj-workspace-deps`, `lint-workspace-lints`) |
| The full upgrade-and-refactor workflow | `rust-skill` |
| Choosing or replacing a crate after a deprecation | `rust-ecosystem` |
| Edition changes to `unsafe`, `extern`, UB rules | `rust-unsafe` |
| Runtime, `select!`, cancel-safety fallout | `rust-async` |
| `Send`/`Sync` or lifetime errors that appeared after the bump | `rust-concurrency` |
| A regression traced to the toolchain change | `rust-performance` |

## Playbook

1. **Pin the baseline.** Record `rustc --version`, the `edition` in every manifest, and every
   declared `rust-version`. *Done when* you can state toolchain, edition and MSRV numerically, and
   `cargo metadata` lists the workspace members you are talking about.
2. **Classify the delta.** Language feature, library API, edition migration, toolchain-only
   (lint/codegen change), or dependency. *Done when* the change has exactly one class, and the
   class names who must act: author, CI, or nobody.
3. **Check availability on the channel you actually build with.** A blog post may describe nightly;
   `#![feature(...)]` never ships to stable consumers. *Done when* every API in the diff is
   reachable at the declared MSRV, not merely at your local toolchain.
4. **Read the primary source.** The `RELEASES.md` entry, the RFC text, the stabilization PR, or
   `rustc --explain E0xxx`. *Done when* each claim in your summary is traceable to one of those,
   not to a summary post.
5. **Try the bump in a branch.** Add a `rust-toolchain.toml`, install with `rustup toolchain
   install`, then `cargo +<toolchain> check --all-targets`, `cargo test`, and
   `cargo report future-incompatibilities` for warnings scheduled to become errors. *Done when* the
   new toolchain is green, or each failure maps to a change found in step 2.
6. **Decide the MSRV explicitly.** Raise `rust-version` only under a stated policy (for example
   "current stable minus two minor releases") and prove it with `cargo +<msrv> check`. *Done when*
   CI has one job that builds at the declared MSRV and fails when it drifts.
7. **Record the delta where the next person looks.** A changelog or `docs/` note naming the change,
   the reason, and the migration. *Done when* the note answers "why are we on this version" without
   opening the PR.

## Examples

```toml
# rust-toolchain.toml — what CI and contributors use, pinned by one file
[toolchain]
channel = "stable"
components = ["rustfmt", "clippy"]
profile = "minimal"
```

```rust
// Deprecation is a migration contract: old call site still works, new path is named.
#[deprecated(
    since = "1.4.0",
    note = "use `Store::put_indexed`; `Store::put` is removed in 2.0"
)]
pub fn put(&mut self, key: &str, value: &[u8]) -> Result<(), Error> {
    self.put_indexed(key, value, None)
}
```

```rust
// Edition 2024: an extern block must be `unsafe extern`, and each item states its own safety.
unsafe extern "C" {
    unsafe fn strlen(s: *const core::ffi::c_char) -> usize;
}
```

## Hard rules

- Never raise `rust-version` without a CI job that builds at it; the declared MSRV is a promise
  (`proj-msrv-declare`).
- Never enable `#![feature(...)]` in code that ships on stable — it breaks every consumer's build.
- Do not combine a toolchain bump and a dependency major in one change; a failure then has two
  possible causes.
- A blog post is not a source. Cite `RELEASES.md`, the RFC, or the stabilization issue.
- No "we're on the latest" without recording which version, when, and why.

## Done when

- toolchain, edition and declared MSRV are written down numerically
- every change in the diff maps to one primary source
- CI builds at both the pinned toolchain and the declared MSRV
- the reasoning is recorded where the next maintainer will find it
