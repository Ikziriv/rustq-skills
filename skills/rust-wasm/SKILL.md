---
name: rust-wasm
description: Compile Rust to WebAssembly for the browser — wasm-bindgen, wasm-pack, trunk, wasm-bindgen-test, crate/dependency selection, and common pitfalls. Use when building or debugging a Rust-to-wasm web app, setting up wasm-bindgen glue, or configuring Leptos, Dioxus, or Yew.
---

# Rust → WASM

## Targets — pick the right triple

- `wasm32-unknown-unknown` — browser web apps. Correct choice ~always for web.
- `wasm32-wasip1` / `wasip2` — WASI, server/CLI. NOT for browser glue with wasm-bindgen.
- `wasm32-unknown-emscripten` — legacy; avoid unless porting Emscripten C code.

```bash
rustup target add wasm32-unknown-unknown
```

## Toolchain

| Tool | Role |
|---|---|
| `wasm-bindgen` (+ `web-sys`/`js-sys`) | JS↔wasm glue: exported fns, DOM/browser APIs |
| `wasm-pack` | build → npm-consumable `pkg/` (wasm + .js glue + .d.ts) |
| `trunk` | zero-config asset pipeline for CSR apps (Rust equivalent of Vite for wasm) |
| `wasm-opt` (binaryen) | size/speed post-pass — always run it in release |
| `twiggy` | size attribution |
| `wasm-bindgen-test` | `cargo test` in a real browser headless |

## Minimal raw wasm-bindgen project

```toml
# Cargo.toml
[lib]
crate-type = ["cdylib", "rlib"]   # rlib lets other Rust crates/tests link it

[dependencies]
wasm-bindgen = "0.2"
web-sys = { version = "0.3", features = ["Window", "Document"] }  # add only what you use
console_error_panic_hook = { version = "0.1", optional = true }   # see pitfalls
```

```rust
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 { a + b }
```

```bash
wasm-pack build --target web --release
# then in JS:  import init, { add } from './pkg/app.js'; await init();
```

`--target`: `web` (ES modules + `init()`) | `bundler` (webpack/vite) | `no-modules` (script tag global) | `deno`/`nodejs`.

## Pitfalls that burn hours

- **Silent panics** → add `console_error_panic_hook` + call `console_error_panic_hook::set_once()` at init, or wasm traps show as `unreachable executed` with no message.
- **`getrandom` fails at runtime** → enable `getrandom = { version = "0.2", features = ["js"] }` (or `0.3` `wasm_js` feature). Symptom: `Error: getrandom` when using `uuid`/`rand`.
- **`wasm-bindgen` CLI version must equal the crate version** in `Cargo.lock` — mismatch = cryptic glue errors. `cargo install wasm-bindgen-cli --version <same>`.
- **i64/BigInt**: wasm-bindgen passes `i64`/`u64` as `BigInt` — JS callers must use `n` suffix or `BigInt()`.
- **`Closure` leaks**: every `Closure::wrap`/`new` passed to JS holds a callback forever unless you `forget` deliberately or drop it — store it and drop on cleanup.
- **`Box::into_raw` exports**: anything raw must have a matching `#[wasm_bindgen] pub fn free_*` or it leaks.
- **Threading needs flags**: `+atomics,+bulk-memory` RUSTFLAGS + COOP/COEP headers; see `rust-wasm-performance/references/speed.md`.
- **`reqwest` in wasm**: works via `fetch` but no streaming bodies, CORS enforced; don't bundle `rustls`.
- **Dev builds are huge/slow** — always evaluate perf on `--release` + `wasm-opt`, never on debug.

## Testing

```toml
[dev-dependencies]
wasm-bindgen-test = "0.3"
```

```bash
wasm-pack test --chrome --headless   # or --firefox
```

Tests live in `tests/` with `#![cfg(target_arch = "wasm32")]` + `#[wasm_bindgen_test]` attributes. CI: `just`/GH Action with `chromedriver` or `--node` for pure-logic tests.

## Frameworks

If the project uses or asks about **Leptos, Dioxus, or Yew** — read `references/frameworks.md` (per-framework build/serve/SSR setup).

## Size & speed

This skill covers correct builds. Once it builds: `rust-wasm-performance` for `wasm-opt`, profile flags, dep slimming; `rust-wasm-audit` for the full checklist.
