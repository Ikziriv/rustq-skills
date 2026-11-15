# RustQ Skills

An installable pack of **Rust** and **WebAssembly** agent skills, built for the global skill tier
(`~/.agents/skills/`) so one install serves every project you open.

Forty-four skills, one flat set, three tiers: a **router** you invoke by hand, a **workflow**
skill the agent picks up on its own, and topic skills that load only when their description fires.

Scope: the global tier only, one install, no bundles and no platform-specific skills. Everything
here is general Rust or Rust→WebAssembly, and every skill in the catalog is shipped.

## Install

One command. Global, for Zed (and any agent that reads `~/.agents/skills`):

```bash
npx skills add Ikziriv/rustq-skills -g -a zed
```

Every detected agent, instead of Zed only:

```bash
npx skills add Ikziriv/rustq-skills -g --all
```

Preview what the repository offers without installing anything:

```bash
npx skills add Ikziriv/rustq-skills -l
```

From a local clone:

```bash
git clone https://github.com/Ikziriv/rustq-skills
cd rustq-skills && npx skills add . -g -a zed
```

No CLI? Copy each `skills/<name>/` folder into `~/.agents/skills/` — the layout is the spec.

## Skills

**Invocation** — `router` = user-invoked, no context cost, only you can fire it (`/rust`);
`auto` = model-invoked, the agent fires it from the description. All skills below are shipped.

### Core — daily use

| Skill | Status | Use it when |
|---|---|---|
| `rust` | ✅ | Deciding which Rust / wasm skill to reach for — type `/rust` |
| `rust-skill` | ✅ | The senior-engineer workflow for any Rust task: write, review, refactor, optimize |
| `rust-skills` | ✅ | Looking up one of 269 prioritized rules by category or prefix (`own-`, `mem-`, `async-`, `unsafe-`, …) |
| `rust-ownership` | ✅ | Ownership, borrows, lifetimes, `E0382` / `E0506` / `E0515` |
| `rust-mutability` | ✅ | Interior mutability, `Cell` / `RefCell` / `Mutex` / `RwLock`, borrow conflicts |
| `rust-concurrency` | ✅ | Threads, async/tokio basics, `Send`/`Sync`, channels, rayon, atomics |
| `rust-error` | ✅ | `Result` / `Option`, `thiserror` / `anyhow`, context, panics |
| `rust-coding` | ✅ | Style, naming, module layout, clippy and rustfmt configuration |
| `rust-web` | ✅ | axum services: handlers, extractors, state, errors, shutdown |

### Advanced — deep understanding

| Skill | Status | Use it when |
|---|---|---|
| `rust-unsafe` | ✅ | Auditing `unsafe`, raw pointers, FFI or manual `Send`/`Sync` for soundness |
| `rust-anti-pattern` | ✅ | Clone abuse, unwrap abuse, stringly-typed APIs, over-abstraction |
| `rust-performance` | ✅ | Profiling, benchmarks, allocation churn, false sharing, release tuning |
| `rust-learner` | ✅ | Editions, MSRV, RFCs, new features, migration planning |
| `rust-ecosystem` | ✅ | Choosing a crate or dependency, or dropping one |
| `rust-cache` | ✅ | Redis caching: keys, TTL, invalidation, stampedes |
| `rust-auth` | ✅ | JWT, API keys, password hashing, rotation, revocation |
| `rust-middleware` | ✅ | Tower layers: CORS, rate limits, timeouts, request IDs, body limits |
| `rust-actor` | ✅ | Actor state, mailboxes, supervision, backpressure |
| `rust-testing` | ✅ | Test strategy: unit, integration, proptest, mockall, loom, criterion |
| `rust-database` | ✅ | sqlx / diesel / sea-orm, pools, transactions, migrations, N+1 |
| `rust-observability` | ✅ | Tracing spans, metrics, OpenTelemetry, log levels, redaction |
| `rust-xacml` | ✅ | Roles, ABAC, policy decisions, deny-overrides, XACML / Cedar / Casbin |

### Expert — specialized

| Skill | Status | Use it when |
|---|---|---|
| `rust-ffi` | ✅ | C / C++ / Python interop: bindgen, cbindgen, cxx, PyO3, ABI rules |
| `rust-pin` | ✅ | `Pin`, `Unpin`, self-referential types, projection |
| `rust-macro` | ✅ | `macro_rules!`, derive, proc-macros, `syn` / `quote`, hygiene |
| `rust-async` | ✅ | Streams, `select!`, backpressure, cancellation safety, deadlines |
| `rust-async-pattern` | ✅ | `'static` task topology, workers, plugins, supervision, graceful shutdown |
| `rust-const` | ✅ | `const fn`, const generics, compile-time assertions |
| `rust-type-driven` | ✅ | Typestate, newtype, `PhantomData`, sealed traits, parse-don't-validate |
| `rust-lifetime-complex` | ✅ | HRTB, GATs, variance, `'static` bounds, "one type is more general" |
| `rust-error-advanced` | ✅ | Error taxonomy, source chains, retry classification, domain→transport mapping |
| `rust-zero-cost` | ✅ | Monomorphization, static vs dynamic dispatch, binary size, verifying codegen |
| `rust-resource` | ✅ | RAII, `Drop` order, guards, cleanup that can fail, leaks |
| `rust-distributed` | ✅ | Idempotency, retries, leases and fencing, outbox, consensus cost |
| `rust-embedded` | ✅ | `no_std`, HAL traits, interrupts, `embassy`, `defmt`, memory budget |
| `rust-linear-type` | ✅ | Must-consume APIs, affine vs linear semantics, preventing implicit drop |
| `rust-coroutine` | ✅ | Generators, suspend/resume, stackful vs stackless, green threads |
| `rust-ebpf` | ✅ | eBPF programs, XDP, maps, CO-RE, verifier limits |
| `rust-gpu` | ✅ | GPU compute, wgpu / CUDA, residency, buffer layout |
| `rust-dpdk` | ✅ | DPDK bursts, mempools, per-core datapaths, drop accounting |

### WebAssembly

| Skill | Status | Use it when |
|---|---|---|
| `rust-wasm` | ✅ | Compiling Rust to wasm: wasm-bindgen, wasm-pack, trunk, wasm-bindgen-test |
| `rust-wasm-performance` | ✅ | A wasm binary that is too big, slow to load, or slow at runtime |
| `rust-wasm-audit` | ✅ | A ranked audit of an existing wasm web app (`scripts/audit.mjs`) |
| `rust-wasm-js-interop` | ✅ | Marshalling cost across the JS ↔ wasm boundary |

### Coverage note

There is deliberately no `rust-skill-index` skill: `/rust` is the index, and a second one would
duplicate it. Every other name in the catalog is shipped.

Until they land, `/rust` routes those jobs to `rust-skill`, `rust-skills` (`test-*`, `err-*`,
`obs-*`, `serde-*`), or the nearest shipped skill.

## How the pack is structured

```
skills/<name>/SKILL.md   one folder per skill; folder name == frontmatter name
skills/rust-skill/       workflow — principles + references/ (patterns, performance, backend, …)
skills/rust-skills/      rule bank — 269 rules in rules/, cited by every other skill
skills/rust-unsafe/      procedure — contract review, references/contracts.md
skills/rust-wasm*/       wasm build, performance, audit, JS boundary
```

Three rules keep the pack from turning into a pile:

1. **One tier per concern.** The router carries no knowledge (zero context load). `rust-skill`
   carries the process. Topic skills carry one decision each, and cite `rust-skills` rule IDs
   instead of restating them.
2. **Router is the index, not a duplicate.** `/rust` answers "which skill" and stops; it never
   restates a skill's content.
3. **Flat, no bundles.** One global install ships the whole set; there are no subsets, categories
   or optional groups to choose between.

Progressive disclosure does the rest: `SKILL.md` stays short and points at `references/` or
`rules/`, and those files load only when the pointer fires.

## Add a skill

1. Create `skills/<name>/SKILL.md` — the folder name and the frontmatter `name` must match.
2. Frontmatter carries the two required fields:

   ```yaml
   ---
   name: rust-my-topic
   description: What it does, then every branch that should trigger it. Use when the user mentions ….
   ---
   ```

3. Keep triggers out of the body and in the `description` — that field is the only thing the agent
   sees before deciding to load the skill.
4. Move detail longer than ~150 lines into `references/`, named by topic, and link it from
   `SKILL.md` with a relative path.
5. Add a row to `skills/rust/SKILL.md` and to the table above.
6. Run the validator and open a PR.

## Validate

```bash
node scripts/validate-skills.mjs
```

Checks every `skills/**/SKILL.md`: frontmatter parses, `name` is lowercase kebab and matches its
folder, `description` is present and within the 1024-character budget, no duplicate names, and every
relative link resolves. CI runs the same script on push and pull request.

## Credits

Attribution for every upstream repository, book and rule set this pack is built on lives in
[CREDITS.md](CREDITS.md). Read it before redistributing.

## License

MIT — see [LICENSE](LICENSE). Vendored content keeps its own license; see [CREDITS.md](CREDITS.md).

## Version

`1.0.0` — see [CHANGELOG.md](CHANGELOG.md).
