---
name: rust-anti-pattern
description: Find and repair Rust anti-patterns — excessive clone, unwrap on data paths, stringly-typed APIs, index loops, over-abstraction, and premature optimization — with the failure each one enables. Use when the user mentions anti-pattern, code smell, clone, unwrap, stringly-typed, over-abstraction, index loop, or premature optimization, or asks for a review that flags design defects rather than syntax.
---

# Rust Anti-Patterns

**Smell** means a promise of a future defect. Name what will panic, allocate per call, or silently accept a new variant — not what merely looks unusual.

A construct that is unfamiliar is not a finding. A `clone()` in a startup function is fine; a `clone()` on the request path is a queue of future latency. The defect, not the pattern name, decides whether it is worth reporting.

## Route first

| Task | Go to |
|---|---|
| Rule text for `anti-*`, `type-*`, `err-*`, `pat-*` | `rust-skills` |
| Full review workflow and its checklists | `rust-skill` |
| Reshaping ownership behind a clone | `rust-ownership` |
| Replacing an unwrap with a real error type | `rust-error` |
| Proving a hot path after a repair | `rust-performance` |
| Naming and API conventions for the repair | `rust-coding` |
| A "clever" shortcut that involves `unsafe` | `rust-unsafe` |
| A smell on the async/concurrency side | `rust-concurrency`, `rust-async` |

## Playbook

1. **Detect mechanically.** `rg -n '\.unwrap\(\)|\.expect\(' --glob '*.rs'` plus `cargo clippy --all-targets -- -W clippy::pedantic`. *Done when* you have a list of `file:line` sites with counts per smell, not an impression.
2. **Filter by defect.** For each site, write the concrete failure it enables: panic reachable from user input, per-request allocation, a new enum variant silently swallowed, an invalid state that type-checks. *Done when* every surviving row has a failure sentence, and the rows without one are dropped.
3. **Rank by reachability.** Data path and public API first, then error paths, then internal conveniences. *Done when* the list is ordered by how easily user input reaches the site.
4. **Repair the signature, not the call site.** Encode the constraint in a type, enum, or parameter so every caller is forced to comply. *Done when* the repair would have prevented the original call from compiling; a per-call-site patch means the root cause is still there.
5. **Prove equivalence.** Write or confirm tests before touching the shape. *Done when* the suite passes with zero edits to assertions — an edited assertion means behaviour changed.
6. **Report what you left.** *Done when* each remaining smell carries its site, its cost, and why it was not worth fixing now.

| Smell | Signature | Repair |
|---|---|---|
| Clone to escape the borrow checker | `.clone()` inside a loop or request (`anti-clone-excessive`) | restructure ownership: borrow, index, or share an `Arc` — clone only at the boundary that owns |
| `unwrap`/`expect` on a data path | `rg` hits outside tests (`anti-unwrap-abuse`, `err-no-unwrap-prod`) | `?` with a typed error, or `let ... else` for the absent case |
| Stringly-typed | `String`/`&str` parameter that is one of N values (`anti-stringly-typed`, `type-no-stringly`) | enum, or a newtype that validates on construction (`api-parse-dont-validate`) |
| Index loop | `for i in 0..v.len()` (`anti-index-over-iter`) | `for x in &v` or an iterator chain |
| Over-abstraction | a trait with one impl, a generic with one instantiation (`anti-over-abstraction`) | inline it; reintroduce the abstraction at the second real implementation |
| Type erasure in the domain | `serde_json::Value`, `Box<dyn Any>`, `HashMap<String, String>` payloads (`anti-type-erasure`) | enum or newtype at the boundary, typed struct inside |
| Intermediate collect | `.collect::<Vec<_>>()` then re-iterate (`anti-collect-intermediate`) | one lazy chain; collect once at the end |
| `&String` / `&Vec<T>` parameters | signature (`anti-string-for-str`, `anti-vec-for-slice`) | `&str` / `&[T]` |
| Catch-all match arm | `_ =>` absorbs new variants (`pat-exhaustive-enum`) | match exhaustively and let the compiler point at every site |
| Boolean or god parameter | `fn(x, y, true, false)` | enum, or a config struct with named fields |
| Premature optimization | `#[inline(always)]`, manual unrolling, `unsafe` fast path with no profile (`anti-premature-optimize`) | measure first (`rust-performance`), otherwise revert |
| `format!` inside a loop | allocation in the hot path (`anti-format-hot-path`, `mem-avoid-format`) | write into a reusable buffer, or `write!` into one `String` |

```rust
// Smell: any string parses, so every callee re-validates what the caller meant.
fn transition(order: &mut Order, to: &str) -> Result<(), Error> { /* … */ }

// Repair: the type carries the allowed set; an invalid status cannot be built.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status { Draft, Paid, Shipped }

impl Order {
    pub fn transition(&mut self, to: Status) -> Result<(), TransitionError> { /* … */ }
}
```

## Hard rules

- A smell without a named future defect is not a finding — do not pad the report.
- Repair the type or signature; if every call site needs a manual edit, the constraint was never encoded.
- Do not trade a clone for `Arc<Mutex<_>>` unless ownership analysis shows the value is genuinely shared — that is over-abstraction with a lock.
- A refactor that requires editing test assertions is a behaviour change: separate commit, separate justification.
- Never silence a detection with `#[allow]` or a wrapper function that hides the call.

## Done when

- Every finding has a site, the concrete failure it enables, and the minimal repair.
- The test suite passes with no assertion edits.
- `cargo clippy --workspace --all-targets -- -D warnings` is clean with no new allows.
- Remaining smells are listed with the reason they were left in place.
