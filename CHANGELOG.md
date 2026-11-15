# Changelog

All notable changes to this pack are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow semantic versioning
for the skill set.

## [1.0.0] - 2026-11-15

Initial release: one flat, globally installable set of 44 skills for the global tier
(`~/.agents/skills/`).

### Catalog

- **Core (7):** `rust-skill`, `rust-ownership`, `rust-mutability`, `rust-concurrency`, `rust-error`,
  `rust-coding`, `rust-web`
- **Advanced (13):** `rust-unsafe`, `rust-anti-pattern`, `rust-performance`, `rust-learner`,
  `rust-ecosystem`, `rust-cache`, `rust-auth`, `rust-middleware`, `rust-actor`, `rust-testing`,
  `rust-database`, `rust-observability`, `rust-xacml`
- **Expert (18):** `rust-ffi`, `rust-pin`, `rust-macro`, `rust-async`, `rust-async-pattern`,
  `rust-const`, `rust-type-driven`, `rust-lifetime-complex`, `rust-error-advanced`,
  `rust-zero-cost`, `rust-resource`, `rust-distributed`, `rust-embedded`, `rust-linear-type`,
  `rust-coroutine`, `rust-ebpf`, `rust-gpu`, `rust-dpdk`
- **WebAssembly (4):** `rust-wasm`, `rust-wasm-performance`, `rust-wasm-audit`,
  `rust-wasm-js-interop`
- **Support (2):** `rust` (router / index), `rust-skills` (269-rule bank)

### Packaging

- `skills/<name>/SKILL.md` layout, discovered by `npx skills add` and installable to
  `~/.agents/skills/` with `-g -a zed`
- `scripts/validate-skills.mjs` — frontmatter, name↔folder, description budget, duplicate names and
  broken-link checks, with zero dependencies
- GitHub Actions workflow running the validator plus an install check
- `README.md` (install, catalog, structure, authoring rules) and `CREDITS.md` (attribution)

### Changed before release

- `rust-master` renamed to `rust-skill`, to match the catalog entry point
- `rust-unsafe-review` renamed to `rust-unsafe`
- `wasm-audit`, `wasm-performance`, `wasm-js-interop` renamed to the `rust-wasm-*` family
- Removed the platform-specific `rust-neon-api` and `rust-railway-minimal` skills
- `rust-skill-index` is not a separate skill: `/rust` is the index
