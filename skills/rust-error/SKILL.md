---
name: rust-error
description: Error handling in Rust — classify each failure, type it with `thiserror` at library boundaries and `anyhow` at application edges, propagate with `?` and context, and keep panics off data paths. Use when the user mentions `Result`, `Option`, errors, `thiserror`, `anyhow`, `panic`, `unwrap`, `?`, context, or custom error types; or asks how to model a failure, why `?` will not convert an error, when panicking is acceptable, or how to replace an `unwrap`/`expect`.
---

# Error Handling

A failure is a value with a contract: it tells the caller what happened and what they can do.
**Leading word: value.** The design question is never "how do I make this compile" but "which
layer owns this failure, and what does the caller do with it."

## Route first

| Concern | Go to |
|---|---|
| Rule text (`err-*`, `anti-unwrap-abuse`, `anti-expect-lazy`) | `rust-skills` |
| The workflow for the whole function or crate | `rust-skill` |
| Removing the failure by making bad states unrepresentable | `rust-type-driven` (`api-parse-dont-validate`, `type-newtype-validated`) |
| Error crossing a task/thread boundary (`Send + Sync + 'static`) | `rust-concurrency` |
| Mapping errors to HTTP status and body | `rust-web` |
| Error spans, structured fields, log vs error | `rust-skills` → `obs-error-chain`, `obs-structured-fields` |
| Panic across FFI, `catch_unwind`, unwinding safety | `rust-unsafe` |
| Error-path tests, `#[should_panic]` | `rust-skills` → `test-should-panic`, `test-arrange-act-assert` |

## Playbook

1. **Classify every failure before writing code:**

   | Failure | Representation | Caller action |
   |---|---|---|
   | caller can fix it (bad input, missing row, timeout) | `Result<T, E>` | retry, correct, report |
   | absence is a normal answer (no such key) | `Option<T>` | branch |
   | programmer bug (violated invariant) | `expect("BUG: ...")` | fix the code |
   | process cannot start (bad config) | `Result` from `main`, exit code | operator fixes |

   Done when each `?`, `unwrap`, `expect` in the diff maps to one row.
2. **Library: one error enum per module boundary.** `#[derive(thiserror::Error)]`, one variant per
   distinct caller action, `#[source]` on wrapped causes, `#[from]` only where conversion is
   unambiguous. Done when `e.source()` walks to the root and no two variants lead to the same
   caller decision.
3. **Application: `anyhow::Result` plus `.with_context()`.** Context at each boundary names the
   operation and the identifier. Done when `{:#}` prints a chain that ends in the OS or parse
   error.
4. **`?` converts, it does not stringify.** Implement `From` / `#[from]` once.
   `map_err(|e| e.to_string())` erases both the type and the chain. Done when the diff contains no
   `to_string()` applied to an error.
5. **Panic only on a documented invariant.** Give the public function a `# Panics` section; do not
   use a panic as control flow inside a task, where it resurfaces as a `JoinError`. Done when
   `rg 'unwrap\(\)|expect\('` on non-test code returns only `BUG:`-justified sites.
6. **Document the failure surface.** Every public fallible function carries `# Errors` listing the
   conditions. Done when `cargo doc` shows one on each.

## Examples

```rust
use std::path::Path;

// Before: two panics, and the message never says which file failed
// let raw = std::fs::read_to_string(&path).unwrap();
// let cfg: Config = toml::from_str(&raw).unwrap();

// After: failure is a value; `{:#}` prints both lines of the chain
fn load(path: &Path) -> anyhow::Result<Config> {
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read config {}", path.display()))?;
    toml::from_str(&raw).with_context(|| format!("failed to parse config {}", path.display()))
}
```

```rust
// Library boundary: typed, one variant per caller decision, source preserved
#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("failed to open {path}")]
    Open {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("{id} is not a known account")]
    UnknownAccount { id: AccountId },
}
```

```rust
// Option when absence is a normal answer, Result when the caller must act on it
fn balance(&self, id: AccountId) -> Option<Money> {
    self.ledger.get(&id).map(|account| account.balance())
}

fn charge(&self, id: AccountId, amount: Money) -> Result<Receipt, ChargeError> {
    let Some(account) = self.account(id) else {
        return Err(ChargeError::UnknownAccount { id });
    };
    account.debit(amount)
}
```

## Hard rules

- No `unwrap` / `expect` on a data path; `expect` is for `BUG:` invariants the types already
  guarantee.
- Never `to_string()` or `format!` an error to move it across a boundary — that deletes `source()`.
- A library exposes its own error type (`Send + Sync + 'static`), never `anyhow::Error` and never
  `String`; the binary converts once at the edge.
- `Option` means absence, `Result` means failure — do not widen one into the other without naming
  what the caller must do.
- One lowercase sentence per message, naming the value that failed, no `Error:` prefix.

## Done when

- no `unwrap()` survives outside `#[cfg(test)]` and documented invariants
- each public fallible function has `# Errors`, and each panicking one has `# Panics`
- printing the top-level error with `{:#}` names the operation, the input, then the root cause
- the library crate returns its own error type and the binary converts it exactly once
