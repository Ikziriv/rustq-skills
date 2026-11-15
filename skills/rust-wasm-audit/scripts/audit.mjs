#!/usr/bin/env node
// rust-wasm-audit: deterministic static checks for a WebAssembly-for-web project.
// Usage: node audit.mjs [project-root]
// Prints findings as [FAIL]/[WARN]/[INFO] lines plus a wasm size report.
// No dependencies; Node 18+.

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, relative, resolve } from "node:path";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";

const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
const SKIP = new Set(["node_modules", ".git", "target", "dist-debug", ".next", ".turbo"]);
const findings = [];
const fail = (m) => findings.push(`[FAIL] ${m}`);
const warn = (m) => findings.push(`[WARN] ${m}`);
const info = (m) => findings.push(`[INFO] ${m}`);

if (!existsSync(root)) {
  console.error(`path not found: ${root}`);
  process.exit(2);
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".cargo") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(p, out);
    } else out.push(p);
  }
  return out;
}

const files = walk(root);
const rel = (p) => relative(root, p);

// --- 1. wasm binaries: sizes ------------------------------------------------
const wasmFiles = files.filter((f) => extname(f) === ".wasm");
const COMPRESS_LIMIT = 25 * 1024 * 1024; // gzip/brotli on huge binaries takes minutes
const rows = [];
for (const f of wasmFiles) {
  const raw = statSync(f).size;
  if (raw > COMPRESS_LIMIT) {
    rows.push({ file: rel(f), raw, gz: null, br: null });
    continue;
  }
  const buf = readFileSync(f);
  // brotli q11 takes ~45s on 8 MB; use a fast tier above 2 MB — sizes are estimates
  const brQuality = raw > 2 * 1024 * 1024 ? 4 : 11;
  const br = brotliCompressSync(buf, {
    params: { [constants.BROTLI_PARAM_QUALITY]: brQuality },
  }).length;
  rows.push({ file: rel(f), raw, gz: gzipSync(buf).length, br });
}
rows.sort((a, b) => b.raw - a.raw);

// --- 2. Cargo release profile ------------------------------------------------
const cargoTomls = files.filter((f) => f.endsWith("Cargo.toml"));
let checkedProfile = false;
for (const ct of cargoTomls) {
  const src = readFileSync(ct, "utf8");
  if (!src.includes("cdylib") && !src.includes("wasm")) continue;
  const m = src.match(/\[profile\.release[^\]]*\]([\s\S]*?)(?=\n\[|$)/);
  if (!m) {
    warn(`${rel(ct)}: no [profile.release] section — wasm builds default to opt-level=3, no LTO`);
    continue;
  }
  checkedProfile = true;
  const body = m[1];
  const has = (k) => new RegExp(`^\\s*${k}\\s*=`).test(body);
  if (!has("opt-level")) warn(`${rel(ct)}: profile.release missing opt-level (use "z" or "s" for size, 3 for speed)`);
  if (!has("lto")) warn(`${rel(ct)}: profile.release missing lto = true/"fat"`);
  if (!has("codegen-units")) warn(`${rel(ct)}: profile.release missing codegen-units = 1`);
  if (!has("panic")) info(`${rel(ct)}: panic = "abort" not set (smaller binary, but breaks unwind-dependent code and some frameworks)`);
  if (!has("strip")) info(`${rel(ct)}: strip not set — rustc strips symbols when wasm-opt runs anyway, but strip = true is free insurance`);
}
if (!checkedProfile) info("no wasm-oriented Cargo.toml found (or none with [profile.release])");

// --- 3. toolchain ------------------------------------------------------------
try {
  const v = execSync("wasm-opt --version", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
  info(`wasm-opt available: ${v}`);
} catch {
  warn("wasm-opt not on PATH — release wasm is likely unoptimized (install binaryen)");
}

// --- 4. JS/HTML instantiation pattern ----------------------------------------
const codeFiles = files.filter((f) =>
  [".html", ".js", ".mjs", ".ts", ".jsx", ".tsx"].includes(extname(f))
);
let streaming = 0;
let buffered = 0;
let sab = 0;
for (const f of codeFiles) {
  const src = readFileSync(f, "utf8");
  streaming += (src.match(/instantiateStreaming/g) || []).length;
  const nonStreaming = (src.match(/WebAssembly\.instantiate\s*\(/g) || []).length;
  if (nonStreaming) {
    buffered += nonStreaming;
    warn(`${rel(f)}: uses WebAssembly.instantiate() — prefers streaming compilation; switch to instantiateStreaming (requires application/wasm MIME)`);
  }
  if (/SharedArrayBuffer|wasm.*threads?|atomics/i.test(src)) {
    sab++;
    warn(`${rel(f)}: SharedArrayBuffer/threads usage — requires Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp headers`);
  }
}
if (streaming) info(`instantiateStreaming used ${streaming}x`);
if (sab) info(`${sab} file(s) reference SharedArrayBuffer/threads`);

// --- 5. wasm-bindgen version skew --------------------------------------------
const lock = files.find((f) => f.endsWith("Cargo.lock"));
if (lock) {
  const src = readFileSync(lock, "utf8");
  const m = src.match(/name\s*=\s*"wasm-bindgen"\s*\nversion\s*=\s*"([^"]+)"/);
  if (m) info(`wasm-bindgen crate version: ${m[1]} — CLI must match exactly`);
}

// --- report ------------------------------------------------------------------
console.log(`\n# rust-wasm-audit: ${root}\n`);
if (rows.length) {
  console.log("| file | raw | gzip | brotli |");
  console.log("|---|---|---|---|");
  for (const r of rows.slice(0, 20)) {
    const kb = (n) => (n / 1024).toFixed(1) + " KB";
    const mb = (n) => (n / 1024 / 1024).toFixed(1) + " MB";
    console.log(`| ${r.file} | ${kb(r.raw)} | ${r.gz == null ? "(skipped)" : kb(r.gz)} | ${r.br == null ? "(skipped)" : kb(r.br)} |`);
    if (r.raw > 50 * 1024 * 1024)
      warn(`${r.file}: ${mb(r.raw)} raw — almost certainly a debug/unstripped build (name section, DWARF). Compressed sizes skipped.`);
    else if (r.raw > 2 * 1024 * 1024)
      warn(`${r.file}: ${kb(r.raw)} raw — consider code splitting / lazy loading`);
    if (r.br != null && r.br > 500 * 1024)
      warn(`${r.file}: ${kb(r.br)} brotli — audit with twiggy, check deps, run wasm-opt -Oz`);
  }
} else {
  info("no .wasm files found — build first, then re-run for size findings");
}
console.log("\n## Findings\n");
for (const f of findings) console.log(f);
const nFail = findings.filter((f) => f.startsWith("[FAIL]")).length;
console.log(`\n${nFail} fail, ${findings.filter((f) => f.startsWith("[WARN]")).length} warn, ${findings.filter((f) => f.startsWith("[INFO]")).length} info`);
