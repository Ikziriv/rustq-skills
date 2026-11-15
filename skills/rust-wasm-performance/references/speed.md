# Making wasm run faster

## Profile before touching code

- Chrome DevTools → Performance: wasm frames appear inline; keep the `name` section in dev builds for readable symbols (`wasm-bindgen` keeps it by default; don't `--strip-debug` on profiling builds).
- `performance.now()` brackets around the JS→wasm call, not inside Rust (timer calls cross the boundary).
- In Rust: `web_sys::Performance` / `console.time` via `web-sys` — cheaper than returning timestamps.
- Sanity check: is time in the wasm compute, or in JS↔wasm marshalling? Marshal time → `rust-wasm-js-interop` skill, not this file.

## Compiler knobs

- `opt-level = 3` for compute-bound code (trade-off with size — measure both).
- `RUSTFLAGS="-C target-feature=+simd128"` — enables auto-vectorization + `std::simd`/`packed_simd` ops. All evergreen browsers support SIMD128 (since ~2021-2023). Verify it took: `wasm-objdump -d | grep v128` or twiggy.
- `codegen-units = 1` + `lto = "fat"` helps speed too.
- `panic = "abort"` removes landing pads — small speed win, mostly size.

## Threads (SharedArrayBuffer + atomics)

Worth it only for genuinely parallel workloads (image/video processing, physics, big transforms):

- Requires nightly-ish flag set: `RUSTFLAGS="-C target-feature=+atomics,+bulk-memory,+mutable-globals"` + `-C link-args=--shared-memory`, or use `wasm-bindgen-rayon` for `rayon` par iterators.
- Server must send `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` — these also gate `SharedArrayBuffer` on the JS side.
- Cost: worker startup + structured-clone of inputs. Below ~50ms of work per task, threads lose to single-threaded SIMD.

## Algorithmic / memory wins (highest leverage)

- Allocate once, reuse buffers: `Vec::with_capacity` outside the loop; wasm `memory.grow` never returns memory.
- Structure-of-arrays beats array-of-structs for SIMD and cache.
- Avoid float→int conversions and division in hot loops (same rules as native).
- Use `f32` over `f64` where precision allows — halves SIMD lane cost.
- In-place transforms; `slice` chunks for parallelism-friendly layout.

## Boundary overhead (the most common real bug)

Symptoms: wasm is fast in benchmarks but the app is slow.

- Per-item calls: `wasm.set_pixel(x,y,c)` in a JS loop → pass the whole `Uint8Array`/`Float32Array` once (see `rust-wasm-js-interop`).
- String/JSON round-trips per frame → keep state in wasm, pass handles/ids.
- Frequent small allocations visible as memory churn → arena/bump allocator (`bumpalo`) for per-frame scratch.

## Startup time

- `instantiateStreaming` + correct `application/wasm` MIME (streaming compile overlaps download).
- Lazy-instantiate: don't `await` wasm before first paint; kick off `WebAssembly.compileStreaming` early, await at first use.
- Keep `main`-time work minimal — heavy one-time init (big lookup tables) can move to a worker or be lazily built.
