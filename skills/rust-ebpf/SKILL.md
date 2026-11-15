---
name: rust-ebpf
description: eBPF programs and their user-space loaders in Rust — design for the kernel verifier's limits, pick between `aya` and `libbpf-rs`, and keep the map/ring-buffer ABI shared and versioned between the two halves. Use when the user mentions eBPF, XDP, tc, kprobe, tracepoint, uprobe, map, ring buffer, tail call, BTF, CO-RE, aya, libbpf-rs or the verifier; or asks why a program fails verification, where a packet hook should attach, or how often to read events out of the kernel.
---

# eBPF Programs & Loaders

**Verifier.** An eBPF program is not ordinary code placed somewhere convenient — it is a bytecode
image the kernel proves safe before one instruction runs: bounded loops, ~512 bytes of stack, no
allocator, a curated helper set. Design for the proof. "It compiles" is not "it verifies".

## Route first

| Concern | Go to |
|---|---|
| Rule text (`unsafe-safety-comment`, `unsafe-minimize-scope`, `unsafe-extern-block`, `mem-assert-type-size`, `perf-batch-fold-reduce`, `obs-structured-fields`) | `rust-skills` |
| The workflow around the crate or service | `rust-skill` |
| Raw pointers, FFI soundness, safety contracts on either side | `rust-unsafe` |
| C ABI, `bindgen`, symbol and struct layout across the boundary | `rust-ffi` |
| `no_std` program side, panic handler, target setup | `rust-embedded` |
| Which events to emit, trace correlation, redaction | `rust-observability` |
| Per-packet cost, batching, syscall amortisation | `rust-performance` |
| User-space side sharing state with workers | `rust-concurrency` |

## Playbook

1. **Design inside the verifier.** Every loop must have a statically provable bound; no allocation,
   no unbounded recursion, a small fixed stack. Done when you can point at the bound for each loop
   and the program's worst-case stack use is under the limit.
2. **Pick the toolchain by the CO-RE answer.** `aya` — pure-Rust loader plus a `-ebpf` program
   crate, no libbpf, no C toolchain; `libbpf-rs` — Rust bindings over libbpf, the natural choice
   when you need libbpf's BTF/CO-RE workflow and the surrounding C ecosystem; `redbpf` — legacy,
   check status before adopting anything unmaintained. Done when the choice is recorded with the
   reason (portability vs. ecosystem) and its maintenance status checked.
3. **Split into three artifacts.** A `no_std` program crate (or C), a user-space loader, and one
   shared module of `#[repr(C)]` keys, values and events used by both. Done when both halves
   rebuild against the same type module and a layout change is treated as a breaking change.
4. **Attach at the cheapest hook that answers the question.** XDP (earliest, driver or generic mode,
   needs linear packet data) → tc (per packet, more helpers, still hot) → kprobe / tracepoint
   (observability) → uprobe (user-space functions). Done when the doc comment states where the hook
   runs, whether packets are linearised, and what the per-event cost is.
5. **Choose maps and buffers deliberately.** Hash / array / LRU hash for state, per-CPU maps to
   avoid contention, ring or perf buffer for events, tail calls to split a program that outgrows the
   instruction limit (the chain depth is capped). Done when no per-packet event is pushed one at a
   time and counters with cross-CPU contention sit in per-CPU maps.
6. **Make portability explicit.** CO-RE plus BTF for kernel-version differences; without it you are
   pinned to the kernel you built against. Done when the loader fails with a named error when
   `/sys/kernel/btf/vmlinux` is absent instead of a bare `EPERM`.
7. **Prove it loads and emits.** `bpftool prog load` / `bpftool map dump`, `aya-log` on the program
   side, and a fixture that triggers a known tracepoint. Done when a test or recorded manual run
   shows the program verified and the map holding the expected keys.

## Examples

```rust
// Program side: `<app>-ebpf/src/main.rs`, `#![no_std]`, `#![no_main]`, target bpfel-unknown-none.
// Illustrative aya shape — APIs move between releases; check the current docs.
use aya_ebpf::{
    helpers::bpf_get_current_pid_tgid,
    macros::{map, tracepoint},
    maps::HashMap,
    programs::TracePointContext,
};

#[map]
static HITS: HashMap<u32, u64> = HashMap::with_max_entries(1024, 0);

#[tracepoint]
pub fn on_enter(_ctx: TracePointContext) -> u32 {
    let pid = (bpf_get_current_pid_tgid() >> 32) as u32;
    // `get` returns a reference into map memory — that is why it is unsafe.
    let next = unsafe { HITS.get(&pid) }.copied().unwrap_or(0) + 1;
    let _ = HITS.insert(&pid, &next, 0);
    0
}
```

```rust
// Loader half: user space, same `HITS` layout. Illustrative; check the current docs.
use aya::{Ebpf, include_bytes_aligned, maps::HashMap, programs::TracePoint};

let mut ebpf = Ebpf::load(include_bytes_aligned!(concat!(env!("OUT_DIR"), "/app-ebpf")))?;
let prog: &mut TracePoint = ebpf.program_mut("on_enter").unwrap().try_into()?;
prog.load()?;                                   // the verifier runs here — and fails here
prog.attach("syscalls", "sys_enter_openat")?;   // (category, tracepoint name)

let mut hits = HashMap::<_, u32, u64>::try_from(ebpf.map_mut("HITS").unwrap())?;
for entry in hits.iter() {                      // iteration shape differs by aya version
    let (pid, count) = entry?;
    println!("pid {pid}: {count}");
}
```

## Hard rules

- The verifier is the specification: a bound the compiler accepts but cannot prove is a reject at
  load time, in production or in CI.
- Program side is `no_std` with a fixed small stack — no allocation, no `format!`, logging only via
  the eBPF logger.
- One `#[repr(C)]` definition per key, value and event, versioned with the loader; never redefine
  the layout on the second side.
- Every raw pointer or FFI call in the loader carries a safety comment (`unsafe-safety-comment`);
  the soundness audit belongs to `rust-unsafe`.
- Loading needs `CAP_BPF` or root, and unprivileged BPF is off by default — a CI job without
  privileges or a BTF-enabled kernel must skip, not fail.

## Done when

- the program is proven by the verifier on the oldest kernel you support, with the job or manual
  run recorded
- exactly one shared type module describes every map key, value and event, and both halves build
  against it behind a compile-time size assertion (`mem-assert-type-size`)
- the attach point, packet linearisation and per-event cost are stated next to the hook
- the loader's failure path distinguishes missing BTF, missing capability and a verifier rejection
