# coll-remove-strategy

> `retain` to filter, `swap_remove` to evict, `remove` only when order is the point

## Why It Matters

`Vec::remove(i)` shifts every following element left: one removal is O(n), and removing k elements in a loop is O(n·k). Filtering a 20k-element list of statement lines by dropping zero rows measures:

| strategy | 20k rows, 2 857 removals | why |
|---|---|---|
| `remove(i)` in a loop | **1.47 s** | ~50M element moves |
| `swap_remove(i)` in a loop | **0.98 ms** | O(1) per removal, garbles order |
| `retain(\|x\| keep(x))` | **1.18 ms** | one pass, order preserved, no bounds checks |

Three orders of magnitude — from one method choice.

## Bad

```rust
// O(n²): every removal memmoves the tail
let mut i = 0;
while i < lines.len() {
    if lines[i].amount.is_zero() {
        lines.remove(i);
    } else {
        i += 1;
    }
}
```

## Good — filtering (order must survive)

```rust
// One forward pass, in place, allocation-free.
lines.retain(|l| !l.amount.is_zero());

// Predicate needs the item's index? drain + filter + extend, or write the
// index-aware pass by hand with `retain_mut`.
let mut i = 0;
lines.retain_mut(|l| {
    i += 1;
    l.amount != Decimal::ZERO || i % 2 == 0
});
```

## Good — eviction (order does not matter)

```rust
// Work queue: process and drop the item we just took.
while let Some(task) = queue.pop() {
    run(task)?;
}

// Remove an arbitrary known index without shifting; the last element fills
// the hole. `i` is NOT incremented afterwards — a new element is now at `i`.
let mut i = 0;
while i < staging.len() {
    if staging[i].rejected {
        staging.swap_remove(i); // O(1)
    } else {
        i += 1;
    }
}
```

`swap_remove` returns the removed element, so it doubles as "take this out and keep it":

```rust
let item = staging.swap_remove(i);
```

## Decision table

| Situation | Use |
|---|---|
| Keep/drop by predicate, order matters | `retain` / `retain_mut` |
| Drop by index, order irrelevant | `swap_remove` |
| Drop several known indices, order irrelevant | `swap_remove` descending, or `retain` with a `HashSet` |
| Drop by index, order matters | `remove` (pay O(n)) or `drain` a range |
| Drain everything | `drain(..)` (keeps capacity — reuse the Vec) |
| FIFO/LIFO queue semantics | `VecDeque`, not `Vec` |

## Pitfalls

- `swap_remove` inside `for i in 0..v.len()` **skips elements**: the swapped-in element is never inspected. Always re-check index `i` after removing.
- For `Vec<&T>` or `Vec<Box<T>>`, `swap` moves 8-16 bytes; for a 56-byte struct it is one struct move — still far cheaper than shifting 50 000 of them.
- `retain` keeps capacity; `into_iter().filter().collect()` allocates a new `Vec` and drops the old buffer.
- If the collection is a `HashMap`/`BTreeMap`, the equivalent is `retain(|k, v| ...)`, not a collect of a new map.

## See Also

- [coll-seq-choice](./coll-seq-choice.md) — `Vec` vs `VecDeque` vs `LinkedList`
- [coll-set-membership](./coll-set-membership.md) — `retain` with a `HashSet` for many-index removal
- [perf-drain-reuse](./perf-drain-reuse.md) — draining without losing the allocation
- [mem-reuse-collections](./mem-reuse-collections.md) — clear and reuse instead of rebuilding
- [perf-iter-over-index](./perf-iter-over-index.md) — indexing that `retain` lets you delete
