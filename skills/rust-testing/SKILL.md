---
name: rust-testing
description: Testing strategy for Rust — pick the test type that can actually falsify a claim, put it where the ceremony is lowest, and remove non-determinism before adding a tool. Use when the user mentions test, unit test, integration test, proptest, property-based, mock, mockall, loom, criterion, benchmark, insta, snapshot, flaky test, doctest, coverage, or fixture; or asks where a test belongs, why one is flaky, what to assert, or how to test async code.
---

# Testing Strategy

A test is a **witness**: it makes one falsifiable claim and fails when that claim stops holding.
**Leading word: witness.** A test you have never seen go red is a comment with syntax; one that
passes for the wrong reason is worse than none — it buys confidence it never earned.

## Route first

| Concern | Go to |
|---|---|
| Rule text: the `test-*` ID cited in each step, plus `serde-*`, `async-*`, `perf-*` | `rust-skills` |
| The workflow for the code under test | `rust-skill` |
| loom, interleavings, `Send`/`Sync`, cancellation | `rust-concurrency` |
| Miri, aliasing, UB in `unsafe` paths | `rust-unsafe` |
| criterion numbers, profiling, release flags | `rust-performance` |
| Handler tests through the router, status and body | `rust-web` |
| Panic vs `Result`, error variant design | `rust-error` |
| Repository tests that need a real engine | `rust-database` |
| Module layout and naming | `rust-coding` |

## Playbook

1. **Name the claim in one sentence; prove only that.** One behaviour per test, body in
   Arrange–Act–Assert, name in the words the docs use (`test-descriptive-names`,
   `test-arrange-act-assert`). *Done when* deleting the Act line fails exactly this test.
2. **Buy the cheapest type that can falsify the claim** (table). Default to a unit test unless the
   claim is about a seam. *Done when* every test in the diff has a type, and a reason a cheaper
   type cannot express that claim.
3. **Put it where the ceremony is lowest.** Unit → `#[cfg(test)] mod tests` in the file
   (`test-cfg-test-module`, `test-use-super`); integration → `tests/<topic>.rs`, one binary per
   topic, public API only (`test-integration-dir`); example → `/// # Examples` doctest, so the docs
   cannot drift (`test-doctest-examples`). *Done when* a test touching a private item is a unit
   test, and a test using only `pub` API lives in `tests/`.
4. **Make setup impossible to skip: RAII, not teardown.** A fixture struct owns the resource and
   cleans up in `Drop` (`test-fixture-raii`). *Done when* removing the fixture line breaks
   compilation, so no test can forget the cleanup.
5. **Delete every uncontrolled input.** Clock, RNG, ids, env, cwd, absolute paths, test order.
   Inject them or freeze them — `tempfile` for paths, a seeded RNG, a paused clock. *Done when*
   ten consecutive `cargo test` runs are green at default parallelism.
6. **Async tests get a runtime, not a `block_on`.** `#[tokio::test]` per test; the multi-threaded
   flavour only when the claim is about concurrency (`test-tokio-async`). *Done when* no test
   builds a runtime by hand and none nests a `block_on` inside a running runtime.
7. **Mock the seam, never the logic under test.** `#[automock]` on a trait the production code
   already takes (`test-mockall-mocking`, `test-mock-traits`); an in-memory fake beats a mock when
   the test asserts on resulting state instead of on calls. *Done when* every mock stands in for
   something slow, remote, or non-deterministic — never for the code you are proving.
8. **Assert the promise, not the implementation.** Return value, error variant, stored row,
   emitted event. Not log text, not `HashMap` order, not private layout. *Done when* the test still
   passes after a behaviour-preserving refactor.
9. **Watch it fail, then make it pass.** Break the production line, run the test, read the failure
   you predicted, revert. *Done when* every new test has been red once.
10. **Diagnose a flake, never retry it.** Run it alone, then the whole binary with
    `--test-threads=1`, then repeatedly: failing only inside a suite means shared state or ordering,
    failing alone means timing. *Done when* the fix names the shared resource, and the suite has no
    retry wrapper and no untracked `#[ignore]`.

| Claim | Type | Lives in | Cost |
|---|---|---|---|
| one module's rule, pure function | unit | `<file>.rs`, `#[cfg(test)] mod tests` | ms |
| the crate works for an outside caller | integration | `tests/<topic>.rs` | seconds |
| the documented example is true | doctest | `/// # Examples` | seconds |
| holds for all inputs, not the chosen ones | property | `proptest!` beside the unit tests | seconds |
| never panics or reads out of bounds on hostile bytes | fuzz | `fuzz/fuzz_targets/` | nightly |
| every interleaving is correct | loom | `#[cfg(loom)]` unit test | minutes |
| large stable output: JSON, rendered text, SQL | snapshot | `insta` in unit or integration | ms |
| no speed regression | bench | `benches/`, `harness = false` | minutes |

Every tool has an edge, and crossing it is how suites rot. **proptest** cannot recover a missing
specification, and shrinking is only as good as the generator. **insta** on a timestamp, uuid, port
or absolute path is a flake generator: redact first. **mockall** on a trait with one implementation
is ceremony that couples the test to call order. **loom** sees no IO or time. **criterion** measures;
it does not assert — gate CI on a ratio against a saved baseline, on the same machine.

## Examples

```rust
// A property, not a bigger example table: encode/decode must hold for every input.
proptest! {
    #[test]
    fn decode_inverts_encode(rows in prop::collection::vec((any::<u32>(), "[a-z]{0,32}"), 0..64)) {
        let encoded = encode(&rows);
        prop_assert_eq!(decode(&encoded).unwrap(), rows);
    }
}
```

```rust
// Virtual clock: a 30-second timeout is tested in milliseconds, with nothing to flake on.
// `start_paused` needs tokio's `test-util` feature.
#[tokio::test(start_paused = true)]
async fn idle_connection_times_out() {
    let (client, _server) = tokio::io::duplex(64);
    let watched = tokio::spawn(watch_heartbeat(client, Duration::from_secs(30)));
    tokio::time::advance(Duration::from_secs(31)).await;
    assert!(watched.await.unwrap().is_err());
}
```

```rust
// The fixture owns the resource; `Drop` runs even when an assertion panics.
struct LogFixture {
    _dir: tempfile::TempDir, // dropping deletes the tree
    path: PathBuf,
}

impl LogFixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        Self { path: dir.path().join("events.log"), _dir: dir }
    }
}
```

## Hard rules

- No `thread::sleep` to wait for a state: poll to a deadline, or advance a paused clock.
- No test mutates process-global state — env, cwd, a global registry. Tests share one process, and
  `std::env::set_var` is `unsafe` in edition 2024 for exactly that reason.
- "Does not panic" is a smoke test: the first test on a path, never the only one.
- No assertion on log text, `HashMap`/`HashSet` order, timestamps, or anything the API does not
  promise.
- Benchmarks and fuzzers stay runnable but out of the default gate; never `#[ignore]` silently.

## Done when

- every new behaviour has one test whose name states the claim, and that test has been seen red
- `cargo test` is green ten runs in a row at default parallelism, with no sleeps
- no test needs a port, a secret, or the public internet unless it is `#[ignore]`d with a reason
- each test in the diff matches one row of the type table
