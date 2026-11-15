---
name: rust-dpdk
description: High-performance packet processing in Rust — deciding whether DPDK or AF_XDP is warranted, poll-mode receive/transmit loops, mempools and mbuf lifecycles, per-core state, RSS, and the deployment contract. Use when the user mentions DPDK, packet processing, poll-mode driver, hugepages, mbuf, mempool, RSS, lcore, AF_XDP, io_uring, NFV, or zero-copy networking, or asks how to hit line rate in Rust, why packets are dropped in a burst loop, or how to keep the hot path lock-free.
---

# DPDK Packet Processing

Packets move in **bursts**, not one at a time. **Leading word: burst.** Every rule below follows
from batching, per-core ownership, and the fact that the hot path must not allocate, lock or log.

DPDK buys predictable latency by bypassing the kernel stack. The price is dedicated cores,
hugepages, and a deployment contract you cannot exercise on a normal CI runner.

## Route first

| Concern | Go to |
|---|---|
| Rule text for unsafe, atomics, memory, perf | `rust-skills` → `unsafe-*`, `conc-*`, `mem-*`, `perf-*`, `obs-*` |
| The workflow for the service around the datapath | `rust-skill` |
| Soundness of the FFI wrapper, `unsafe` blocks | `rust-unsafe` |
| Binding generation, ABI and ownership across C | `rust-ffi` |
| Whether the measured requirement even needs DPDK | `rust-performance` (measure first) |
| Per-core state, lock-free queues, atomics | `rust-concurrency` |
| Async control plane around a blocking datapath | `rust-async`, `rust-async-pattern` |
| Per-core counters, drop reasons, latency histograms | `rust-observability` |
| Small binary, no hidden allocation | `rust-zero-cost` |

## Playbook

1. **Get the requirement in numbers.** Packets per second, packet size mix, p99 latency budget and
   core budget. *Done when* the target is written down and the existing path has been measured
   against it — the kernel stack often wins below a few hundred thousand packets per second.
2. **Choose the transport by what you must avoid, not by fashion.**

   | Need | Mechanism |
   |---|---|
   | Line rate, full control of the NIC, dedicated cores | DPDK (`dpdk-sys` / `rust-dpdk`-style bindings) |
   | Zero-copy without leaving the kernel driver model | AF_XDP (`capsule`-style crates) |
   | Syscall batching for storage or sockets, no full bypass | `io_uring` |
   | Ordinary request/response throughput | `tokio` + `sendmmsg`; stop here |

   *Done when* the choice is recorded with the measured gap it closes.
3. **Reserve the machine.** EAL init with hugepages, one pinned lcore per worker, NUMA-local memory,
   devices bound to the poll-mode driver. *Done when* the runbook reproduces the environment from
   scratch, including hugepage size and core isolation.
4. **Give each core its own state.** No `Mutex` on the hot path; per-lcore counters, per-lcore
   mempools or rings for hand-off. *Done when* the datapath contains no shared mutable state.
5. **Own the mbuf lifecycle.** Every received mbuf is either sent, queued, or freed — exactly once.
   *Done when* the code has one exit point per mbuf and a test or counter proves nothing leaks.
6. **Process in bursts of 32.** RX burst, transform, TX burst; free what you drop; retry the tail of
   a partial TX once, then drop explicitly. *Done when* the loop handles a full burst, a partial
   burst, and a zero-length burst without special-casing downstream code.
7. **Distribute with RSS, filter in software.** Configure RSS at init; flow rules for the rest.
   Keep the classification table per-core and reload it without stopping the datapath. *Done when*
   hash distribution across queues is measured, not assumed.
8. **Instrument the datapath cheaply.** Per-core counters for received, sent, dropped-by-reason and
   ring-full; no formatting, no logging, no allocation. *Done when* every dropped packet has a counter
   that explains it.
9. **Plan for hardware.** CI cannot exercise DPDK: ship a simulated or loopback path for correctness
   and a reproducible benchmark host for performance. *Done when* both paths run from a documented
   command.

## Example

```rust
const BURST: usize = 32;

// Illustrative skeleton: binding names differ per crate — check current docs.
fn run_worker(port: &mut Port, pool: &Mempool) -> Result<(), PortError> {
    let mut rx: [*mut Mbuf; BURST] = [std::ptr::null_mut(); BURST];
    let mut tx: [*mut Mbuf; BURST] = [std::ptr::null_mut(); BURST];

    loop {
        let received = port.rx_burst(&mut rx); // FFI boundary: unsafe lives in the wrapper
        let mut ready = 0;

        for slot in &rx[..received] {
            // process must not allocate, lock or log
            match process(*slot) {
                Some(out) => {
                    tx[ready] = out;
                    ready += 1;
                }
                None => pool.free(*slot), // dropped: free immediately, count it
            }
        }

        let mut sent = 0;
        while sent < ready {
            sent += port.tx_burst(&tx[sent..ready]);
        }
        // A partial TX leaves the remainder owned by us: free or requeue it, never leak.
        for slot in &tx[sent..ready] {
            pool.free(*slot);
        }
    }
}
```

## Hard rules

- No allocation, locking, logging or panic on the datapath; failures become drop counters.
- One owner per mbuf, one exit per packet: sent, queued or freed — exactly once.
- Per-core state by default; hand-off through a ring, never through a `Mutex`.
- Every FFI call is an `unsafe` boundary — the wrapper needs a `// SAFETY:` argument per operation.
- DPDK is a deployment commitment: if it cannot be reproduced on the target host, pick a lighter path.

## Done when

- the measured target is met on the benchmark host, with the packet-size mix stated
- per-core drop counters account for every packet that did not reach the wire
- the datapath has no shared mutable state, allocation or logging
- a simulated path covers correctness in CI, and the hardware runbook reproduces the environment
