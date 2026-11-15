# Credits

This pack is maintained by **[Rizky Ivan Darmawan (@Ikziriv)](https://github.com/Ikziriv)** and is
MIT-licensed (see [LICENSE](LICENSE)). Some of the material it ships was written by other people and
is redistributed here under that author's license. This file is the attribution record for all of
it.

## Vendored third-party work

| Skill | Upstream | Author | License | How it is used |
|---|---|---|---|---|
| `skills/rust-skills` | [leonardomso/rust-skills](https://github.com/leonardomso/rust-skills) v1.5.1 | Leonardo Maldonado ([@leonardomso](https://github.com/leonardomso)) | MIT | Redistributed with its `rules/` catalog. The upstream `LICENSE` is kept at `skills/rust-skills/LICENSE` and the upstream `CHANGELOG.md` is kept for provenance. |

> If you fork this pack and update `skills/rust-skills`, keep the upstream `LICENSE` and
> `CHANGELOG.md` in place. MIT requires the copyright notice to travel with the copies.

## Consulted, not copied

| Work | Owner | License | How it is used |
|---|---|---|---|
| [google/rust-skills](https://github.com/google/rust-skills) | Google LLC | Apache-2.0 | Consulted while writing the `unsafe-` rules, `rust-unsafe`, and the safety-comment / Miri / `unsafe extern` conventions. No files from that repository are copied into this pack; the text here is original. |
| [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) | Rust project contributors | MIT OR Apache-2.0 | Naming, trait and API-design rules. |
| [The Rust Reference](https://doc.rust-lang.org/reference/) · [Rustonomicon](https://doc.rust-lang.org/nomicon/) · [Edition Guide](https://doc.rust-lang.org/edition-guide/) · [Cargo Book](https://doc.rust-lang.org/cargo/) | Rust project contributors | MIT OR Apache-2.0 | Language semantics, unsafe contracts, edition changes, manifest and profile settings. |
| [The Rust Performance Book](https://nnethercote.github.io/perf-book/) | Nicholas Nethercote | MIT OR Apache-2.0 | Allocation, iterator, profile and optimization guidance in `rust-skill` and `rust-skills`. |
| [Rust Design Patterns](https://rust-unofficial.github.io/patterns/) | rust-unofficial contributors | MIT OR Apache-2.0 | Builder, newtype, RAII and typestate patterns. |
| [Rust Atomics and Locks](https://marabos.nl/atomics/) | Mara Bos | MIT OR Apache-2.0 | Atomics, `Ordering`, memory-model rules (`conc-`). |
| [Effective Rust](https://effective-rust.com/) | David Drysdale | MIT OR Apache-2.0 | API and type-safety guidance. |
| [Clippy lint documentation](https://rust-lang.github.io/rust-clippy/) · [Miri](https://github.com/rust-lang/miri) | Rust project contributors | MIT OR Apache-2.0 | `lint-` and `unsafe-miri-ci` rules. |

Real-world codebases read for idiom (not copied): ripgrep, tokio, serde, clap, polars, axum, cargo,
hyper, bevy, rayon, wasm-bindgen, and dtolnay's crates (thiserror, anyhow, syn, quote).

## Tooling

- **wasm-bindgen, wasm-pack, trunk, wasm-bindgen-test** — Rust and WebAssembly working group (MIT OR
  Apache-2.0). Subject matter for `rust-wasm`, `rust-wasm-js-interop`, `rust-wasm-performance`.
- **Binaryen `wasm-opt`** — WebAssembly project (Apache-2.0). Referenced in the size playbook.
- **sqlx, axum, tokio** — their respective maintainers (MIT OR Apache-2.0). Subject matter for the
  async and backend references.
- **tower / tower-http** — tower-rs contributors. Subject matter for `rust-middleware`.
- **redis-rs, deadpool-redis** — their maintainers. Subject matter for `rust-cache`.
- **jsonwebtoken, argon2, sha2, subtle** — RustCrypto and Keats contributors. Subject matter for
  `rust-auth`.
- **actix, ractor** — their maintainers. Subject matter for `rust-actor`.
- **bindgen, cbindgen, cxx, PyO3** — their maintainers. Subject matter for `rust-ffi`.
- **proptest, mockall, loom, criterion, insta** — their maintainers. Subject matter for
  `rust-testing`.
- **diesel, sea-orm** — their maintainers. Subject matter for `rust-database`.
- **tracing, tracing-subscriber, opentelemetry-rust, prometheus** — their maintainers. Subject
  matter for `rust-observability`.
- **embedded-hal, cortex-m, embassy, defmt, heapless, probe-rs** — their maintainers. Subject
  matter for `rust-embedded`.
- **openraft, raft-rs, tonic, turmoil** — their maintainers. Subject matter for `rust-distributed`.
- **cargo-asm, cargo-bloat, nm** — their maintainers. Tooling referenced by `rust-zero-cost`.
- **cedar-policy, casbin-rs, regorus** — their maintainers. Subject matter for `rust-xacml`.
- **corosensei, may, async-stream** — their maintainers. Subject matter for `rust-coroutine`.
- **aya, libbpf-rs, bpftool** — their maintainers. Subject matter for `rust-ebpf`.
- **wgpu, cudarc, opencl3, bytemuck** — their maintainers. Subject matter for `rust-gpu`.
- **DPDK, capsule (AF_XDP), io_uring** — their maintainers. Subject matter for `rust-dpdk`.

Crate and framework names above are referenced as subject matter only; no code is copied from them,
and each project's license stays its own.

## Packaging

- **[Agent Skills specification](https://agentskills.io)** — the `SKILL.md` + frontmatter format.
- **[vercel-labs/skills](https://github.com/vercel-labs/skills)** (MIT) — the `npx skills` CLI used
  for installation, and the source of the `skills/<name>/SKILL.md` discovery convention.
- **[skills.sh](https://skills.sh)** — the public skill directory.

## Adding a skill to this pack

When you add a skill, add a row to the tables above if it:

- vendors text, code or rules from someone else (add the license and a `LICENSE` file inside the
  skill folder), or
- follows an upstream project closely enough that a reader would want to know the source.

If you write it from scratch, say so in one line — "original work" is an attribution too.
