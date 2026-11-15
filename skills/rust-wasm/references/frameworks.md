# Rust web frameworks on wasm32-unknown-unknown

Per-framework setup and gotchas. All three compile to CSR wasm via trunk (or a cargo subcommand) and all three have SSR/hydration modes where the same Rust code runs on the server.

## Leptos

- CLI: `cargo install cargo-leptos` then `cargo leptos watch` / `build --release`. For pure CSR without SSR, `trunk serve` works too.
- Layout: typically a workspace — `app` (isomorphic code), `server`/`frontend` crates; or `start-axum`/`start-actix` templates. Cargo features `ssr` / `hydrate` / `csr` gate what compiles where — keep `sqlx`, DB code, and secrets behind `ssr`.
- Render modes per route: `SsrMode::Async`, `PartiallyBlocked`, `InOrder`, `OutOfOrder` — pick per page; CSR-only sites skip this entirely.
- `panic = "abort"` breaks error boundaries/`Suspense` recovery in some versions — test hydration errors after enabling.
- Server functions (`#[server]`) serialize args — heavy payloads cross a normal HTTP boundary; they're POSTs, not wasm interop.
- Hydration = full Rust app in wasm: bundle size matters double (SSR HTML is free-ish, wasm pays for interactivity). Lazy routes + `<Suspense>` for code splitting.

## Dioxus

- CLI: `cargo install dioxus-cli` then `dx serve --platform web` / `dx build --release --platform web`. `dx` handles wasm-opt and bundling.
- `dx.toml`/`Dioxus.toml` configures asset pipeline and features.
- Fullstack: `#[server]`-style `server_fn` + `--features ssr`; same workspace/feature gating pattern as Leptos.
- Signals model — `use_signal` is fine-grained; avoid `spawn`ing per-item in render (re-render storms look like wasm slowness but are vdom diffing).

## Yew

- CLI: `trunk serve` / `trunk build --release`. `index.html` at project root with `<link data-trunk rel="rust" .../>`.
- Components: function components + `use_state` hooks (current), or `Component` trait (legacy, still in old codebases).
- No built-in SSR story comparable to Leptos/Dioxus; SSR via `yew::ServerRenderer` exists but is less integrated.
- Callback-heavy: `Callback::from` closures in props re-create each render; `use_callback`/`#[memo]` for hot lists.

## Cross-cutting

- `trunk` runs `wasm-opt` **only if configured**: `[tools] wasm-opt = "z"` in `Trunk.toml` (or default off). Verify it's actually running — common silent miss.
- All three: `web-sys` features are additive and compile per-crate — add features only for APIs used.
- Router/URL handling, `localStorage`, etc. all go through `web-sys`/`gloo` — `gloo-*` crates are the usual wrappers and are small.
