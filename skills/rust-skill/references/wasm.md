# Rust → WebAssembly

## Targets — pick the right triple

- `wasm32-unknown-unknown` — browser web apps; the correct choice ~always for web.
- `wasm32-wasip1` / `wasip2` — WASI, server/CLI; NOT for browser glue with wasm-bindgen.
- `wasm32-unknown-emscripten` — legacy; avoid unless porting Emscripten C code.

```bash
rustup target add wasm32-unknown-unknown
```

## Toolchain

| Tool | Role |
|---|---|
| `wasm-bindgen` (+ `web-sys`/`js-sys`) | JS↔wasm glue: exported fns, DOM/browser APIs |
| `wasm-pack` | build → npm-consumable `pkg/` (wasm + .js glue + .d.ts) |
| `trunk` | zero-config asset pipeline for CSR apps (Rust's Vite for wasm) |
| `wasm-opt` (binaryen) | size/speed post-pass — always run it in release |
| `twiggy` | size attribution |
| `wasm-bindgen-test` | `cargo test` in a real headless browser |

## Minimal raw wasm-bindgen project

```toml
# Cargo.toml
[lib]
crate-type = ["cdylib", "rlib"]   # rlib lets other Rust crates/tests link it

[dependencies]
wasm-bindgen = "0.2"
web-sys = { version = "0.3", features = ["Window", "Document"] }  # add only what you use
console_error_panic_hook = { version = "0.1", optional = true }
```

```rust
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 { a + b }
```

```bash
wasm-pack build --target web --release
# JS:  import init, { add } from './pkg/app.js'; await init();
```

`--target`: `web` (ES modules + `init()`) | `bundler` (webpack/vite) | `no-modules` (script tag) | `deno`/`nodejs`.

## Writing bindings

- `#[wasm_bindgen]` on `pub` functions/structs/impls. Only `pub` items cross the boundary.
- Accept/return only compatible types: `JsValue`, `String`, `Vec<u8>`, `f64`/`u32`/`i32`, `bool`, `Option`, `Result<T, JsValue>` (errors become JS exceptions).
- `js_sys`/`web_sys` for browser APIs; gate `web_sys` features precisely.
- Callbacks: `Closure::wrap(Box::new(move || ...))` then `.as_ref().unchecked_ref()`, and `forget` (or store) it so it isn't dropped.
- Large binary data as `Vec<u8>`/`&[u8]`; `serde-wasm-bindgen` for structured data.

## Pitfalls that burn hours

- **Silent panics** → add `console_error_panic_hook` and call `set_once()` at init, or wasm traps show as `unreachable executed` with no message.
- **`getrandom` fails at runtime** → `getrandom = { version = "0.2", features = ["js"] }` (or 0.3 `wasm_js`). Symptom: `Error: getrandom` with `uuid`/`rand`.
- **CLI version must equal crate version** — a `wasm-bindgen-cli`/crate mismatch in `Cargo.lock` = cryptic glue errors. `cargo install wasm-bindgen-cli --version <same>`.
- **`i64`/`u64` = `BigInt`** — JS callers use the `n` suffix or `BigInt()`.
- **`Closure` leaks** — every `Closure` passed to JS lives forever unless dropped; store it and drop on cleanup.
- **`Box::into_raw` exports** — anything raw needs a matching `#[wasm_bindgen] pub fn free_*` or it leaks.
- **Threading needs flags** — `+atomics,+bulk-memory` RUSTFLAGS + COOP/COEP headers.
- **`reqwest` in wasm** — works via `fetch` but no streaming bodies, CORS enforced; don't bundle `rustls`.
- **Dev builds are huge/slow** — evaluate perf on `--release` + `wasm-opt`, never debug.

## Testing

```toml
[dev-dependencies]
wasm-bindgen-test = "0.3"
```

```bash
wasm-pack test --chrome --headless   # or --firefox
```

Tests live in `tests/` with `#![cfg(target_arch = "wasm32")]` + `#[wasm_bindgen_test]`. CI: `just`/GH Action with `chromedriver`, or `--node` for pure-logic tests.

## Frameworks

Leptos, Dioxus, and Yew all compile to CSR wasm via `trunk` and have SSR/hydration modes. For Leptos see [leptos.md](leptos.md). Dioxus: `cargo install dioxus-cli` → `dx serve --platform web`; Yew: `trunk serve` + `index.html` with `<link data-trunk rel="rust">`. Cross-cutting: `trunk` runs `wasm-opt` **only if configured** (`[tools] wasm-opt = "z"` in `Trunk.toml`) — verify it's actually running.

## Performance & size

- WASM has no threads by default — keep hot loops tight and avoid allocation inside them.
- Shrink size: `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip`, `wasm-opt -Oz`, audit with `cargo-bloat`/`twiggy`. Avoid `tokio`/heavy deps unless the target supports them.
- Avoid panics that unwind across the FFI boundary (they become traps); return `Result`. Consider `panic = "abort"`.
- No `std::io`/filesystem/threading in WASM (unless WASI) — use `js_sys`/`web_sys` or `wasm-bindgen-futures`.

## Async & JS interop

- `wasm-bindgen-futures` (`spawn_local`, `JsFuture`) bridges Promises → Rust `Future`; `spawn_local` for async on the JS event loop.
- `gloo` provides ergonomic wrappers (timers, storage, events) over `web-sys`.

## no_std / minimal

- `#![no_std]` + `wee_alloc`; `core`/`alloc` only; no `std` collections that need an allocator you don't provide.
