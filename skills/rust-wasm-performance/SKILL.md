---
name: rust-wasm-performance
description: Optimize WebAssembly performance on the web — binary size (wasm-opt, LTO, dependency bloat), startup/load time, and runtime speed (SIMD, threads, allocator, profiling). Use when the user says wasm is too big, slow to load, or slow at runtime, or asks to make wasm faster or smaller.
---

# WASM Performance

Two distinct problems, two playbooks. Diagnose which one you have before optimizing — fixes for size and speed sometimes conflict (e.g. `opt-level = "z"` vs `3`).

## Measure first

1. Run the deterministic checks:

   ```bash
   node ~/.agents/skills/rust-wasm-audit/scripts/audit.mjs <project-root>
   ```

   This reports per-file raw/gzip/brotli sizes and missing release-profile flags.
2. Attribution — find what is inside the binary before shrinking it:

   ```bash
   cargo install twiggy
   twiggy top -n 30 app_bg.wasm        # biggest functions
   twiggy dominators app_bg.wasm       # retained-by graphs
   twiggy monos app_bg.wasm            # generic monomorphization bloat
   ```

3. For runtime: Chrome DevTools → Performance panel records wasm frames natively (named if the `name` section survives). `performance.now()` around suspect calls on the JS side.

## Pick the playbook

- User says **"too big", "slow to load", "bundle size", " Lighthouse/TTI"** → read `references/size.md`.
- User says **"slow at runtime", "janky", "laggy", "frame drops", "hot loop"** → read `references/speed.md`.
- Both complaints present → fix size first; `opt-level` choice in `size.md` notes the trade-off.

## Shared quick wins (check before either playbook)

- `wasm-opt -Oz` (or `-O3`) runs in the release pipeline — often the single largest fix.
- Release profile in `Cargo.toml` is real, not assumed: verify `[profile.release]` actually matches the crate that produces the `.wasm`.
- wasm is served brotli-compressed with `application/wasm` MIME and `instantiateStreaming`.
- No per-item JS↔wasm calls in hot paths — boundary design is in the `rust-wasm-js-interop` skill.
