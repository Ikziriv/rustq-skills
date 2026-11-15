# mem-borrow-static-labels

> Don't own text that never changes: `&'static str`, or `Cow<'static, str>`

## Why It Matters

A domain struct that carries human-readable text — a payslip line label, a status name, an audit-trail action, a line item description — is usually filled with **fixed** strings. Storing them as `String` buys nothing and costs a heap allocation plus a copy per row, plus a deallocation at drop time, plus 24 bytes per field instead of 16.

Measured on payroll: emitting ~9 lines per employee with `label: String` produced **17 000 allocations for 1 000 employees**; switching the field to `&'static str` produced **1 000** (just the `Vec` per employee — ~0 with a reused buffer). The time cost was 5.6 µs → 1.3 µs per employee.

```rust
// 24 bytes + one allocation per field
pub struct CalcLine { pub label: String, /* ... */ }

// 16 bytes, zero allocation, still `Copy`
pub struct CalcLine { pub label: &'static str, /* ... */ }
```

## Bad

```rust
lines.push(Line {
    component_code: COMP_KES_EE,
    label: "Iuran BPJS Kesehatan (pegawai)".to_string(), // allocation per line
    amount,
});
```

## Good — the label is a constant

```rust
lines.push(Line {
    component_code: COMP_KES_EE,
    label: "Iuran BPJS Kesehatan (pegawai)", // &'static str
    amount,
});
```

Keep the table of `(code, label)` pairs in a `const`, so it also stops being rebuilt on the stack:

```rust
struct Spec {
    program: Program,
    benefit: (&'static str, &'static str), // (code, label)
}

const SPECS: [Spec; 5] = [ /* ... */ ]; // static memory, not a per-call array
```

## When it sometimes owns: `Cow<'static, str>`

```rust
use std::borrow::Cow;

pub struct Line {
    pub code: &'static str,
    /// Borrowed for engine labels, owned for one-off overrides.
    pub label: Cow<'static, str>,
}

label: Cow::Borrowed("PPh 21")            // zero allocation
label: Cow::Owned(user_override)          // allocates only when it must
```

`Cow` is the right answer when *most* values are static and *some* are formatted. If **any** common path formats (`format!("Tunjangan {}", name)`), you have not removed the allocation — measure before claiming a win.

## Rules

- Choose the narrowest type that is still honest: `&'static str` > `Cow<'static, str>` > `String` > `Arc<str>`.
- `&'static str` fields keep the struct `Copy` — which then lets the whole line flow through sinks, sorts and `Vec`s without clone.
- Do not `format!` a constant, and do not `to_string()` a literal "for consistency".
- If the text is user-editable, it belongs on a `String` in the *config* struct, resolved once per batch — not on every output row.
- Serialization: `&'static str` and `Cow<'static, str>` both `Serialize`; `Cow` also `Deserialize` (into `Owned`).

## Migrating a struct field without breaking callers

```rust
// 1. keep the field name, change the type; the compiler lists every site
pub label: &'static str,
// 2. at the boundary that needs an owned value, allocate exactly once
fn into_row(line: CalcLine) -> Row { Row { label: line.label.to_string() } }
```

## See Also

- [mem-avoid-format](./mem-avoid-format.md) — `format!` where a literal works
- [mem-zero-copy](./mem-zero-copy.md) — borrowed views over owned copies
- [own-cow-conditional](./own-cow-conditional.md) — `Cow` for conditional ownership
- [own-copy-small](./own-copy-small.md) — keeping `Copy` on small domain structs
- [mem-write-over-format](./mem-write-over-format.md) — when the text really is dynamic
- [perf-black-box-bench](./perf-black-box-bench.md) — count allocations, not just time
