# Shrinking wasm binary size

Ordered by typical impact. Measure with twiggy after each change.

## Cargo profile (do all of these)

```toml
[profile.release]
opt-level = "z"      # or "s"; use 3 only if runtime profiling proves it matters
lto = "fat"          # "fat" > "thin" > true for size
codegen-units = 1
panic = "abort"      # removes landing pads; breaks catch_unwind and some frameworks
strip = true         # symbols; wasm-opt strips anyway but free insurance
debug = false
```

`panic = "abort"` caveat: Leptos SSR and error-boundary patterns may rely on unwinding — test hydration after enabling.

## wasm-opt pass

```bash
wasm-opt -Oz --enable-bulk-memory --enable-sign-ext -o out.wasm in.wasm
```

- Trunk: set `wasm-opt = "z"` (or `[tools]`/`data` config) — trunk runs wasm-opt only if configured.
- Also try `--strip-debug --strip-producers` and `--vacuum`.

## Dependency bloat — the usual suspects

Check `Cargo.lock`/`twiggy` for these, replace where cheap:

| Heavy | Lighter alternative |
|---|---|
| `regex` | `regex-lite`, or hand-rolled parsing |
| `chrono` | `time` with minimal features, or `jiff` |
| `serde` + `serde_json` on client | `serde-wasm-bindgen`, or `bincode`/`postcard` for wasm-internal data |
| `getrandom` | only pulls JS glue if needed; avoid in deps that never call it |
| `rustls` (in wasm client) | use `fetch`/browser TLS via `reqwest` `wasm` config — never bundle TLS in wasm |
| full `uuid`/`url`/`http` stack | browser APIs via `web-sys` |
| i18n/formatting crates | `Intl.*` via `js-sys`/`wasm-bindgen` |

Feature audit: `cargo tree -e features -i <crate>` to find who enabled what; `default-features = false` everywhere heavy.

## Allocator

- Default `dlmalloc` is fine for most apps (~10-20 KB).
- `lol_alloc` / `talck` (`wasm_allocator` alternatives) are smaller than `dlmalloc` for allocation-light apps.
- `wee_alloc` is unmaintained — do not add it to new code; remove if present.

## Advanced (accept complexity only when still too big)

- `wasm-snip` — cut functions you know are unreachable (e.g. panic formatting): `wasm-snip --snip-rust-fmt-code --snip-rust-panicking-code`.
- Nightly `-Z build-std=std,panic_abort -Z build-std-features=panic_immediate_abort` — rebuilds std without fmt/panic machinery; biggest single lever for tiny apps, but nightly-pinned.
- `wasm-bindgen --remove-name-section --remove-producers-section`.
- Framework code splitting: lazy-load routes/features so non-critical wasm loads after first paint (Leptos: lazy routes + `<Suspense>`; Dioxus/Yew: dynamic `import()` per feature module).

## Serving — free 60-80%

- Precompress to `.br` + `.gz` at build time (most CDNs/servers pick it up); brotli beats gzip by ~15% on wasm.
- Hashed filename + `Cache-Control: public, max-age=31536000, immutable` — second visit costs ~0.
- `instantiateStreaming(fetch(...))` overlaps compile with download; without it the browser buffers the whole module first.
