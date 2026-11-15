---
name: rust-unsafe
description: >-
  Review Rust `unsafe` code for soundness: inventory every unsafe site, extract the
  safety contract it relies on, attack that contract, and prove the result with
  Miri, Clippy and loom. Use when reviewing or writing `unsafe` blocks or
  `unsafe fn`, raw pointers, FFI / `extern`, `transmute`, `MaybeUninit`, unions,
  `UnsafeCell`, manual `Send`/`Sync` impls, or when asked about UB, soundness,
  memory safety, data races, or whether unsafe code is actually safe. Produces a
  ranked findings report with a verdict per site.
---

# Rust Unsafe Review

The unit of review is the **contract**: the exact invariant that makes one `unsafe`
operation sound. No contract, no verdict — "looks fine" is not a finding.

Everything else in Rust is checked by the compiler. `unsafe` is where you become the
compiler, so the review is a proof read, not a style pass.

## Procedure

Run the steps in order. Each ends on a checkable criterion; do not move on until it holds.

### 1. Inventory

Find every site — blocks, `unsafe fn`, `unsafe impl`, `unsafe trait` — and list them.

```bash
rg -n --glob '*.rs' '\bunsafe\b' --glob '!target'
cargo clippy --all-targets -- -W clippy::undocumented_unsafe_blocks
```

**Done when** every hit is a row in a table: `file:line | operation | caller context`.

### 2. Extract the contract

For each site, read the `// SAFETY:` comment and the `# Safety` section of any `unsafe fn`.
Write down, in one sentence, what must be true of the inputs for this operation to be defined.
If the comment restates the code ("we call from_raw_parts"), the contract is missing — that is
itself a finding.

**Done when** every row has a sentence naming a property of the data (validity, alignment,
initialization, exclusivity, lifetime, provenance), not a property of the code structure.

### 3. Attack the contract

Assume the caller can be wrong. For each row, ask what breaks it: another thread, a caller that
passes a dangling pointer, a length that is off by one, a `&T` that aliases, a value that is
uninitialized, a panic that unwinds. Read [references/contracts.md](references/contracts.md) for
the per-operation obligations and the UB class each one prevents.

**Done when** every row has a verdict — `sound`, `unsound`, or `depends on caller` — and every
`depends on caller` names the precondition the function must document or assert.

### 4. Prove it

Cheap checks first, then the expensive ones on the code that carries risk:

```bash
cargo miri test                       # UB, aliasing, uninit, provenance
cargo test --release                  # the optimizer can expose UB that debug hides
RUSTFLAGS="-Zsanitizer=address" cargo +nightly test -Zbuild-std --target <target>
```

For lock-free or channel code, run the concurrency tests under `loom`
(`rust-skills` → `test-loom-concurrency`). For FFI, build with `-Zsanitizer=address` and exercise
the boundary calls from the foreign side, not just from Rust tests.

**Done when** Miri is green on every test that reaches an unsafe site, or the sites it cannot reach
are listed with the reason (FFI, threads, `std` internals).

### 5. Report

Output a ranked report; do not rewrite the code unless asked.

| Severity | Meaning |
|---|---|
| S0 | UB reachable from safe code — a soundness hole in a public API |
| S1 | UB reachable only by violating a documented precondition that the type does not enforce |
| S2 | Contract held, but undocumented or unprovable (`// SAFETY:` missing or wrong) |
| S3 | Sound and documented; suggestion only (narrow the block, drop the `unsafe`) |

Each finding carries: location, the contract it violates, the UB class, a minimal fix, and the
test that would have caught it. End with one verdict line per site.

## Delegation

| Question | Go to |
|---|---|
| Ownership, lifetimes, aliasing rules of safe code | `rust-skills` → `own-*`, `mem-*` |
| The `unsafe` rule set (`unsafe-safety-comment`, `unsafe-minimize-scope`, `unsafe-miri-ci`, …) | `rust-skills` → `unsafe-*` |
| Design of the safe wrapper around the unsafe core | `rust-skill` → `references/memory-safety.md` |
| Performance of the code being reviewed | `rust-skill` → `references/performance.md` |

## Guardrails

- A review never adds `unsafe impl Send`/`Sync` to quiet a compiler error.
- A contract that lives only in a PR comment is a finding, not a fix.
- Widening a block until it compiles is not a repair; shrink it to the operation that needs it.
- Report what you could not verify, and how to verify it, instead of guessing.
