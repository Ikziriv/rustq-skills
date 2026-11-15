---
name: rust-ecosystem
description: Choose Rust dependencies deliberately — std first, then a crate screened on maintenance, license, MSRV, feature flags and API surface, isolated behind your own seam. Use when the user mentions a crate, library, framework, dependency choice, "which crate", maintenance status, license, feature flags, MSRV compatibility, or std versus crate; or asks how to replace a dependency, whether a crate is safe to adopt, or why a build pulls in so much code.
---

# Choosing Crates

Every dependency is a **liability**: you compile it, audit it, upgrade it, and inherit its breaking
changes long after the spike. Adopt it because it removes work you would otherwise own, and make
the decision reversible.

The question is never "which crate is popular" — it is "which obligation am I accepting".

## Route first

| Concern | Go to |
|---|---|
| Rule text for features, workspace deps, metadata, naming | `rust-skills` (`proj-feature-additive`, `proj-workspace-deps`, `lint-cargo-metadata`, `name-crate-no-rs`) |
| The workflow for the code that uses the crate | `rust-skill` |
| Whether the toolchain supports the crate's MSRV or edition | `rust-learner` |
| Wrapping a foreign type without leaking it | `rust-skills` → `api-extension-trait`, `api-newtype-safety` |
| Auditing a dependency that brings `unsafe` | `rust-unsafe` |
| Data-access crates, pools, migrations | `rust-database` |
| HTTP and framework stacking | `rust-web` |
| Cost of the chosen crate on a hot path | `rust-performance` |

## Playbook

1. **State the requirement without a crate name.** Capability needed, target (`no_std`, wasm,
   Windows), MSRV, async runtime, license constraints, who must maintain it. *Done when* you can
   score candidates against that list without naming a favourite.
2. **Try `std` first, and write down why it fails.**

   | Need | `std` answer | Crate only if |
   |---|---|---|
   | Hashing | `HashMap` (DoS-resistant default hasher) | you profiled it (`perf-ahash`) |
   | Time | `Instant`, `SystemTime` for durations and epochs | you need calendars, zones, formatting |
   | Random | — | any real randomness needs `rand` |
   | JSON, HTTP, TLS, regex | — | always a crate |
   | Channels, threads, locks | `std::sync`, `std::thread` | you need async, bounded, or select |

   *Done when* the candidate table includes a "std-only" row that states the exact gap.
3. **Screen on facts, not stars.** For each candidate: last release date, open-issue triage,
   declared `rust-version`, `unsafe` usage, `default-features = false` build, and
   `cargo tree -i <crate>` for who else already depends on it. *Done when* every row has the same
   six fields filled, and unmaintained ones are marked rather than ranked.
4. **Enumerate the feature flags.** Read what default features pull in, confirm they are additive
   (`proj-feature-additive`), and note any feature that changes runtime behaviour rather than API.
   *Done when* the manifest names the exact feature set you enable, and `cargo build --timings`
   shows the cost.
5. **Spike it behind your own seam.** One real call path, your error type, your trait. *Done when*
   the spike builds at the declared MSRV with the chosen features and one test exercises it.
6. **Isolate it.** Adapter trait or newtype in one module; domain types never mention the crate's
   types in a public signature (`api-extension-trait`). *Done when* replacing the crate touches one
   file plus the manifest.
7. **Record and police it.** Declare versions once in `[workspace.dependencies]`
   (`proj-workspace-deps`), write the reason in the PR or an ADR, and add license plus advisory
   checks to CI. *Done when* a future reader can learn why this crate exists from the repo alone.

## Examples

```toml
# One decision in the workspace root; members inherit it (proj-workspace-deps)
[workspace.dependencies]
serde = { version = "1", default-features = false, features = ["derive"] }
```

```rust
use std::time::{SystemTime, UNIX_EPOCH};

// Own the seam: the trait is yours, the crate is an implementation detail behind it
pub trait Clock {
    fn now_ms(&self) -> i64;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> i64 {
        let since_epoch = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        i64::try_from(since_epoch.as_millis()).unwrap_or(i64::MAX)
    }
}
```

## Hard rules

- `std` first; a dependency must name the gap it fills in one sentence.
- Default features left on is a decision nobody made — list them and justify each.
- No crate enters the tree without a license check and an advisory scan in CI.
- No third-party type in a public signature unless you accept the upgrade obligation it creates.
- "Works today" is not maintenance: last release, open issues and bus factor are part of the cost.

## Done when

- candidates were scored on identical facts, with one decision and its reason recorded
- the chosen feature set builds at the declared MSRV
- the crate sits behind a local seam, not spread through the codebase
- license and advisory checks run in CI on every pull request
