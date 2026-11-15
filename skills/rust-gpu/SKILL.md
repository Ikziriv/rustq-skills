---
name: rust-gpu
description: GPU compute and memory from Rust — choosing wgpu vs CUDA bindings, keeping data resident on the device, matching host/shader layout, and measuring instead of guessing. Use when the user mentions GPU, CUDA, compute shader, wgpu, compute pipeline, VRAM, buffer transfer, workgroup, kernel launch, or opencl, or asks why a GPU kernel is slower than expected, how to avoid per-element transfers, or how to lay out a struct shared with a shader.
---

# GPU Compute in Rust

The device is fast; the bus is not. **Leading word: resident.** The whole design question is how much
work happens per byte you move, and how long the data stays on the device between phases.

Shaders are still written in WGSL, GLSL or SPIR-V in practice. Rust is the host language, and
`rust-gpu` (Rust → SPIR-V) is promising but fast-moving — check its status before promising it.

## Route first

| Concern | Go to |
|---|---|
| Rule text for perf, memory layout, numeric safety | `rust-skills` → `perf-*`, `mem-*`, `num-float-compare`, `mem-assert-type-size` |
| The workflow for the surrounding service | `rust-skill` |
| Choosing a GPU crate by requirement, not preference | this skill, then `rust-ecosystem` |
| Bit-casting and POD buffer types, FFI to vendor libraries | `rust-ffi`, `rust-unsafe` |
| CPU-side parallelism (rayon) before reaching for a GPU | `rust-concurrency` |
| CPU baseline and profiling the host side | `rust-performance` |
| Reference-vs-GPU test harness | `rust-testing` |
| Async readback, device work off the request path | `rust-async` |
| Kernel latency, drop/loss counters, per-device metrics | `rust-observability` |

## Playbook

1. **Pick the path by requirement.** `wgpu` for portable compute (Vulkan/Metal/DX12/WebGPU) and the
   default choice; `cudarc`/`cust` when you are CUDA-only and need cuBLAS/cuDNN; `opencl3` for legacy
   OpenCL. *Done when* the choice is written down with the reason (portability, vendor library,
   existing shaders), not "it was faster".
2. **Prove the CPU is too slow first.** A correct CPU implementation is the reference you will test
   against; without it you cannot tell a wrong result from a fast one. *Done when* the CPU baseline
   exists and its time is recorded.
3. **Keep data resident.** Upload once, run every phase on device buffers, read back once. *Done when*
   no transfer appears inside a loop over work items.
4. **Make the layout one decision, asserted.** Shader `struct` and Rust `#[repr(C)]` type must agree in
   order, size and alignment; uniform buffers are stricter than `size_of`. *Done when* a unit test
   asserts size and alignment, and `bytemuck` is the only path between bytes and values.
5. **Bound every index on the host.** A shader has no bounds checks: dispatch exactly
   `ceil(work / workgroup)` and guard the tail inside the shader. *Done when* a non-multiple-of-workgroup
   input is covered by a test.
6. **Size workgroups per device, then measure.** Occupancy and workgroup size are hardware properties.
   Tune with the vendor profiler (Nsight, Radeon GPU Profiler, Xcode) rather than intuition. *Done when*
   a before/after measurement exists for the chosen size.
7. **Handle asynchrony and failure.** Readback via a fence or mapped buffer, never a blocking wait in
   an async handler; treat device loss as a recoverable error, not a panic. *Done when* a lost device
   returns an error and a test proves the service does not deadlock.

## Examples

```rust
use wgpu::util::DeviceExt;

// Upload once: storage buffer the shader can read and write.
let input = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
    label: Some("input"),
    contents: bytemuck::cast_slice(&data),
    usage: wgpu::BufferUsages::STORAGE,
});

let output = device.create_buffer(&wgpu::BufferDescriptor {
    label: Some("output"),
    size: (std::mem::size_of::<u32>() * data.len()) as u64,
    usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
    mapped_at_creation: false,
});

// Dispatch covers the tail: 64 threads per workgroup, rounded up.
let groups = (data.len() as u32).div_ceil(64);
let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
{
    let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
        label: Some("scale"),
        timestamp_writes: None,
    });
    pass.set_pipeline(&pipeline);
    pass.set_bind_group(0, &bind_group, &[]);
    pass.dispatch_workgroups(groups, 1, 1);
}
queue.submit(Some(encoder.finish()));
// Read back once, after the whole pipeline, not per element.
```

`wgpu` renames descriptors between releases (`entry_point` became an `Option`, pass descriptors gained
fields). Check the docs for the version you have rather than copying a snippet from a blog.

```rust
// The layout contract, asserted instead of hoped for.
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct Params {
    scale: f32,
    offset: f32,
    len: u32,
    _pad: u32, // uniform and storage layouts differ; pad to the strictest rule
}

const _: () = assert!(std::mem::size_of::<Params>() == 16);
```

## Hard rules

- No host↔device transfer inside a per-element loop; batch into one upload and one readback.
- Never assume the shader validates: bounds, lengths and dispatch sizes are host-side obligations.
- One authoritative byte-layout definition, asserted at compile time and shared with the shader.
- Validation layers on in debug builds; device loss is an error path, never a panic.
- No performance claim without a measurement from the vendor profiler and the CPU baseline.

## Done when

- the CPU reference and the GPU path agree within an explicit tolerance, including a non-aligned tail
- no transfer or blocking wait appears inside a loop or a request handler
- `size_of` / alignment assertions exist for every struct crossing the boundary
- a measurement shows the GPU path is faster than the CPU baseline for the real workload
