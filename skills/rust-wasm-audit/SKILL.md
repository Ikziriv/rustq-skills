---
name: rust-wasm-audit
description: Audit a WebAssembly-for-web project end to end — binary size, Cargo/build profile, serving and loading path, CSP/security headers, and JS-WASM boundary overhead. Use when the user asks to audit or review a wasm web app, find why wasm loads slowly, or run a wasm health check.
---

# WASM Audit

Audit a web project that ships `.wasm`. Produce a ranked findings report, not a rewrite.

## Quick start

```bash
node <skill-dir>/scripts/audit.mjs <project-root>
```

The script performs the deterministic checks below and prints findings with severity. Then work the manual checklist — the script cannot see HTTP headers, CDN config, or runtime profiles.

## Workflow

1. Run `scripts/audit.mjs` on the project root. Collect every `WARN`/`FAIL`.
2. Verify what static analysis cannot see (checklist below).
3. Report findings ranked: severity, evidence (file/line or measurement), concrete fix.

## What the script checks

- **Binary size** — every `*.wasm` file with raw / gzip / brotli sizes. Flags >500 KB brotli (needs justification), >2 MB raw.
- **Cargo release profile** — `[profile.release]` should set `opt-level`, `lto`, `codegen-units = 1`, `strip`; flags missing keys.
- **Toolchain** — `wasm-opt` availability and version.
- **Instantiation pattern** — `instantiateStreaming` vs buffered `instantiate` in HTML/JS.
- **SharedArrayBuffer usage** — flags code that needs COOP/COEP headers.

## Manual checklist

Work these in order; each line is a finding if absent:

### Serving

- `.wasm` served with `Content-Type: application/wasm` — required for `instantiateStreaming`; wrong MIME silently falls back to full buffering.
- Compression: brotli (or at minimum gzip) actually applied to `.wasm` — check `Content-Encoding` on the wire, not just config. `.wasm` compresses ~60-80%.
- Cache headers: hashed filename + `Cache-Control: immutable, max-age=31536000`. Un-hashed filename + long cache = stale binary bug.
- `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` present **only if** the app uses threads/`SharedArrayBuffer` — missing = threads break; present unnecessarily = third-party embeds break.

### Security

- CSP: wasm compilation needs `'wasm-unsafe-eval'` in `script-src` (Chrome/Edge/Firefox). Flag `'unsafe-eval'` — broader than needed.
- Untrusted wasm modules: check where `.wasm` URLs come from; a wasm file is executable code.

### Runtime

- Boundary overhead: hot loops crossing JS↔wasm per item (per-pixel, per-row, per-entity) are the most common real perf bug. Look for calls inside `requestAnimationFrame`, `for` loops, or per-network-item handlers.
- Memory growth: `WebAssembly.Memory` never shrinks; long sessions with growing data = leak-like growth. Rust side: `Vec::with_capacity` churn, `Box::into_raw` without a matching `free` export.
- Lazy loading: the main wasm should not block first paint for non-essential features; look for code-split / deferred module instantiation.

### Build hygiene

- `wasm-bindgen` CLI version matches the crate version in `Cargo.lock` — mismatch produces runtime glue errors.
- `wasm-opt` actually runs in the release pipeline (many `trunk`/CI setups skip it).
- Debug symbols/`name` section stripped from production wasm.

## Report format

```markdown
## WASM Audit — <project>

### Critical
- [evidence] finding → fix

### Warnings
- ...

### Info / passed
- one-line summary of what checked out
```

For deep fixes, hand off: size problems → `rust-wasm-performance` skill (`references/size.md`); boundary design → `rust-wasm-js-interop`.
