---
name: rust-embedded
description: Write embedded and `no_std` Rust under hard memory, cycle, and latency budgets — choosing `core` vs `alloc`, targeting Cortex-M and RISC-V triples, `embedded-hal` drivers, interrupt-safe shared state, `embassy` async, and `defmt` logging with no console. Use when the user mentions no_std, embedded, ISR, interrupt, RISC-V, Cortex-M, HAL, embassy, panic handler, linker script, heapless, defmt, probe-rs, memory constrained, or a WASM target, or asks how to share state with an interrupt, how to log on a board with no console, or why a firmware image does not fit.
---

# Embedded & `no_std`

On a part with 64 KiB of RAM, every stack frame, buffer and interrupt is a line in a **budget** you
cannot borrow against. `no_std` does not make code smaller by itself — it removes the things that
would hide the budget from you (heap, threads, unwinding) and hands you the linker script instead.

## Route first

| Concern | Go to |
|---|---|
| The workflow for the crate being written | `rust-skill` |
| Rule text: unsafe scope, fixed capacity, no-format | `rust-skills` → `unsafe-safety-comment`, `unsafe-minimize-scope`, `mem-assert-type-size`, `mem-arrayvec`, `mem-avoid-format`, `proj-feature-additive` |
| Soundness review of `static mut`, `unsafe impl Sync`, MMIO | `rust-unsafe` |
| Host tests, mocks, property tests for driver logic | `rust-testing` |
| Cycle budget, codegen, `#[inline]` decisions | `rust-performance` |
| Executor task topology, shutdown, channel depth | `rust-async-pattern` |
| Streaming and backpressure inside an async driver | `rust-async` |
| Device logs once they reach the collecting host | `rust-observability` |
| `wasm32-unknown-unknown` non-browser core logic | `rust-wasm` |

## Playbook

1. **Set the runtime floor: `core`, `alloc`, or `std`.** `#![no_std]` removes the heap, threads and
   unwinding. `alloc` is defensible when a global allocator exists and growth is bounded by design
   (arena, one-shot init); otherwise `heapless` (`ArrayVec`, `Deque`, `String`) makes capacity a
   compile-time input. *Done when* every collection either has a `const CAPACITY` or names who frees
   its memory.
2. **Pick the triple and the memory map before the first driver.** `thumbv7em-none-eabihf` (M4F: FPU,
   atomic CAS), `thumbv6m-none-eabi` (M0: no FPU, no atomic CAS — use `critical-section`),
   `riscv32imac-unknown-none-elf`. Add `#![no_main]`, `#[entry]`, a `#[panic_handler]`, and a
   `memory.x` taken from the datasheet. *Done when* `cargo build --target <triple>` links and the map
   file shows FLASH, RAM and stack inside the part's numbers.
3. **Write drivers against `embedded-hal`, not a vendor crate.** Generic over `I2c`, `Spi` or
   `DelayNs` — or their `embedded-hal-async` counterparts — so the logic compiles and tests on the
   host. *Done when* the driver's dependencies contain no PAC and `cargo test` passes on x86.
4. **Make shared state explicit.** ISR↔main sharing goes through `critical_section::Mutex<RefCell<T>>`
   (`cortex_m::interrupt::Mutex` is the older equivalent) or `embassy_sync::Mutex`; atomics only
   where the target has them; `read_volatile` / `write_volatile` only for MMIO. *Done when* no
   `static mut` survives without a `// SAFETY:` naming the interrupt that touches it, and
   `rust-unsafe` has reviewed the soundness.
5. **Keep ISRs to latch-and-return.** Clear the flag, push to a fixed-capacity queue, return; the
   main loop or the executor does the work. *Done when* no ISR formats, blocks, or waits on a lock a
   preempted task may hold.
6. **Get async without an RTOS.** An `embassy` executor polls `'static` futures on one stack; the
   timer interrupt is the wake source, and futures need no `Send` because there is one thread per
   executor. *Done when* every task is spawned `'static` and you can point at the interrupt that
   wakes the executor.
7. **Log with no console.** `defmt` + RTT: format strings resolve at compile time, so an enabled line
   costs a few bytes of copy; `probe-rs run` flashes and streams it. *Done when* a `defmt::info!`
   appears on the host while the target keeps running.
8. **Measure the two silent failures.** Stack overflow corrupts memory with no message — paint the
   stack and read high-water, or enable an MPU guard; heap exhaustion returns `None`, it does not
   panic. *Done when* the worst-case path's high-water is measured and the margin is written down.

## Examples

```rust
use embedded_hal::i2c::I2c;

const ADDR: u8 = 0x48;
const TEMP_REG: u8 = 0x00;

/// Generic over the HAL trait: the same code runs on silicon and against a host mock.
pub fn read_temperature<I2C>(bus: &mut I2C) -> Result<i16, I2C::Error>
where
    I2C: I2c,
{
    let mut buf = [0u8; 2];
    bus.write(ADDR, &[TEMP_REG])?;
    bus.read(ADDR, &mut buf)?;
    // 12-bit left-justified; deci-degrees, because some targets have no FPU
    Ok((i16::from_be_bytes(buf) >> 4) * 5 / 8)
}
```

```rust
#![no_std]
#![no_main]

use cortex_m_rt::entry;
use panic_probe as _; // #[panic_handler] that reports the panic over defmt/RTT

#[entry]
fn main() -> ! {
    let _cp = cortex_m::Peripherals::take().expect("taken once, before interrupts");
    // clocks, GPIO, interrupt priorities; `memory.x` already fixed where this runs from
    loop {
        cortex_m::asm::wfi(); // sleep until an interrupt instead of spinning
    }
}
```

```rust
use core::cell::RefCell;
use critical_section::Mutex;

static QUEUE: Mutex<RefCell<heapless::Deque<u16, 32>>> =
    Mutex::new(RefCell::new(heapless::Deque::new()));

#[cortex_m_rt::interrupt]
fn TIMER0() {
    let sample = 42; // read the peripheral register, then get out
    critical_section::with(|cs| {
        let _ = QUEUE.borrow(cs).borrow_mut().push_back(sample); // full: drop, never block
    });
}
```

`wasm32-unknown-unknown` is a `no_std`-capable target, so this skill covers the core logic — but
`wasm-bindgen`, JS glue and the browser belong to `rust-wasm`. Keep that boundary in a separate crate.

## Hard rules

- `no_std` is the default; `alloc` needs a named allocator and a fragmentation story, and fixed
  capacity is a design input, not a limitation.
- Every interrupt-shared static is atomic, behind `critical-section`/`Mutex`, or `unsafe` with a
  `// SAFETY:` naming the ISR and the invariant it preserves.
- An ISR latches and returns: no `.await`, no blocking, no formatting, no unbounded loop.
- Drivers depend on `embedded-hal`, never a vendor PAC; vendor code crosses at exactly one boundary.
- If the linker script, the map file and the stack high-water were not read, the memory budget is
  unknown and the firmware is not ready.

## Done when

- `cargo build --target <triple>` links against a `memory.x`, and flash/RAM/stack fit with a written
  margin
- the driver crate tests on the host against a mock `embedded-hal` impl
- no `static mut`, no formatting inside an ISR, every collection capacity a constant
- `defmt` output is observed over RTT with `probe-rs` on the real board
