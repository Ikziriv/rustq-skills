---
name: rust-wasm-js-interop
description: Design the JavaScript-WebAssembly boundary for web apps — typed arrays, string passing, memory layout, avoiding per-call serialization overhead, handles, and workers with SharedArrayBuffer. Use when wasm calls feel slow, data marshalling dominates profiling, or when structuring wasm-bindgen exports and JS glue.
---

# JS ↔ WASM Interop

The boundary is not free. A wasm call is cheap (~ns) but **moving data across it** is where real time goes. Every design decision below follows from one rule: **batch data, minimize crossings, prefer views over copies**.

## Cost model (mental)

| Operation | Cost |
|---|---|
| Plain fn call, numeric args | ~free |
| Pass a string | copy + UTF-8 encode each direction |
| Pass a JS array/object | serde or manual marshalling — usually the real cost |
| `Uint8Array` view on wasm memory | zero-copy — the fast path |
| `Closure`/callback into JS | real but small; fine per-event, bad per-item |

## Zero-copy patterns

**Pass bulk data in (image, audio, table):**

```rust
#[wasm_bindgen]
pub fn process(data: &[u8]) -> Vec<u8> { /* data is a view-adjacent copy, cheap for bytes */ }
```

`&[u8]`/`&[f32]` args get a memcpy into wasm memory — fine. For truly zero-copy *reads*, expose memory:

```rust
#[wasm_bindgen]
pub fn buffer_ptr(&self) -> *const f32 { self.buf.as_ptr() }
#[wasm_bindgen]
pub fn buffer_len(&self) -> usize { self.buf.len() }
```

```js
const view = new Float32Array(wasm.memory.buffer, obj.buffer_ptr(), obj.buffer_len());
```

**Stale views after growth**: `memory.grow` detaches `memory.buffer` — any `TypedArray` created before a grow is dead. Re-create views after any call that can allocate, or keep a known capacity and assert against it.

**Strings**: fine for UI paths. Hot paths: keep text in wasm, return handles; or pre-intern strings JS-side and pass indices.

## Handles > serialization for complex objects

Don't `serde` a struct graph per call. Store objects wasm-side, pass an id:

```rust
#[wasm_bindgen]
pub struct Engine { /* owns everything */ }

#[wasm_bindgen]
pub fn engine_new() -> Engine { Engine::new() }   // JS holds the handle
#[wasm_bindgen]
impl Engine {
    pub fn tick(&mut self, dt: f32) { }
}
```

wasm-bindgen generates a JS wrapper; the Rust object lives in wasm heap and is freed when the JS object is GC'd (or call `.free()` deterministically). This is almost always the right shape for stateful APIs.

## Serialization when you must

- `serde-wasm-bindgen` — serializes via JS values, ~2-10x faster than `serde_json` round-trip. Default choice for structured data.
- `serde_json` strings — only when you already have JSON elsewhere.
- `bincode`/`postcard` + `Uint8Array` — fastest for wasm-internal data crossing once (save/load blobs).

## Async

`wasm-bindgen-futures::spawn_local` bridges `async` Rust ↔ JS `Promise`. `#[wasm_bindgen]` can return `impl Future`/`Promise` directly. Don't block: there is no blocking in browser wasm — design APIs async-first or restructure.

## Workers + SharedArrayBuffer (compute)

- Pattern: main thread posts a `SharedArrayBuffer`; workers run wasm with shared memory + `Atomics`.
- Requires `+atomics` target-feature build AND `COOP: same-origin` + `COEP: require-corp` headers.
- Without SAB: `postMessage` structured-clones — fine for coarse tasks, kills per-frame data shipping.

## Pitfalls

- `BigInt` for `i64`/`u64` args — callers must pass `BigInt`, silent coercion failures otherwise.
- `Closure` leaks — store and drop; `Closure::once` for one-shots.
- Exceptions across the boundary: Rust panic in wasm = JS `RuntimeError` trap, call stack intact. Don't catch-and-continue — wasm state may be corrupt; reset the instance.
- `JsValue` proliferation — passing `JsValue` everywhere erases types; put real types at the boundary, `JsValue` only at the genuinely-dynamic edge.
- Memory never shrinks — a peak of 500 MB stays 500 MB for the session. Design for plateau, not peak, or recycle instances.

## Audit tie-in

`rust-wasm-audit` flags per-item boundary calls in hot loops; `rust-wasm-performance/references/speed.md` has the profiling flow to confirm marshalling vs compute.
