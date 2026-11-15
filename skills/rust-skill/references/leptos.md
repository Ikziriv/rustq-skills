# Fullstack Rust Web with Leptos

## Mindset

Leptos is fine-grained reactive. Reactivity is **signals** (`RwSignal`, `ReadSignal`, `WriteSignal`), not a virtual DOM. Reads subscribe, writes notify — only the exact DOM node re-runs.

## Fundamentals

- `#[component]` functions run once (or on hydration) — they are not re-run on state change. Put reactive reads *inside* closures/effects/`move ||` blocks.
- Prefer `RwSignal` (`create_rw_signal`) for simple state; `create_signal` for split read/write; `Memo` for derived values; `create_effect` for side effects.
- Read with `.get()`, write with `.set()`, update atomically with `.update(|v| ...)`.
- Derive state (`let double = move || signal.get() * 2;`) instead of syncing manually — memos and closures keep views consistent.

## Rendering & control flow

- Use the control-flow components for reactive branches/lists: `<Show>`, `<Suspense>`, `<Transition>`, `<For>`.
- `<For keyed>` gives efficient list updates; give each item a stable `key`.
- Wrap async data in `<Suspense>` with a fallback so the page degrades gracefully instead of blocking.

## Async & data fetching

- Use `create_resource` (or `.await` inside `<Suspense>` on the server) to load data. Server functions (`#[server]`) give type-safe RPC from client to server.
- `#[server]` functions run on the server; keep the client/server contract explicit (serializable args + return). They are the boundary — never leak server secrets or DB internals through them.
- Prefer `create_resource` over manual `.await` in effects; it handles cancellation and refetch.

## SSR / hydration / islands

- `leptos_axum` (or `leptos_actix`) for server-rendered apps: render HTML on the server, hydrate interactivity on the client.
- Hydrate only what's interactive. Split islands so the static shell is SSR'd and interactive widgets hydrate in place.
- Use `#[cfg(feature = "ssr")]` to gate server-only code; `#[cfg(feature = "hydrate")]` for client-only.
- For heavy client state, use local signals to avoid shipping serialized state.
- Per-route render modes: `SsrMode::Async`, `PartiallyBlocked`, `InOrder`, `OutOfOrder` — pick per page; CSR-only sites skip this.
- `panic = "abort"` breaks error boundaries / `Suspense` recovery in some versions — test hydration errors after enabling.
- `#[server]` functions are normal HTTP POSTs, not wasm interop — heavy payloads cross the wire.

## Structure

- Separate server-only modules (`ssr`), shared domain types, and client components. Shared types must be `Serialize`/`Deserialize` for crossing the `#[server]` boundary.
- Keep components small and single-purpose; extract reusable UI into composable `#[component]` functions, not macros.

## Testing & build

- CLI: `cargo install cargo-leptos` → `cargo leptos watch` / `build --release`; `leptosfmt` for formatting.
- Layout: a workspace — `app` (isomorphic) + `server`/`frontend` crates; features `ssr`/`hydrate`/`csr` gate what compiles where — keep `sqlx`, DB code, and secrets behind `ssr`.
- Test server functions with a test client; unit-test pure domain logic directly.
