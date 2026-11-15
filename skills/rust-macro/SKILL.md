---
name: rust-macro
description: Macros and proc-macros in Rust — choose between macro_rules, derive, attribute and function-like macros, then keep the expansion hygienic, path-safe and cheap. Use when the user mentions macros, `macro_rules!`, derive, proc-macro, `syn`, `quote`, `cargo expand`, attribute macros, or macro hygiene; or asks to write a derive macro, fix a macro that breaks downstream, or make a macro error point at the right token.
---

# Macros & Proc-Macros

A macro is a source-to-source rewrite, so the artifact to review is the **expansion**, not the
macro body. **Leading word: expansion.** Hygiene, fully-qualified paths and honest spans are what
make an expansion safe to paste into someone else's crate.

## Route first

| Concern | Go to |
|---|---|
| Rule text (`macro-rules-hygiene`, `macro-export-crate-path`, `macro-fragment-specifiers`, `macro-proc-two-crate`, `macro-proc-syn-quote`, `macro-proc-error-spans`, `macro-prefer-functions`) | `rust-skills` |
| Whole-crate workflow, workspace layout for the `-macros` crate | `rust-skill` |
| Generated `unsafe` code, `unsafe impl`, `#[unsafe(no_mangle)]` | `rust-unsafe` |
| An invariant better expressed as a type than as generated code | `rust-type-driven` |
| Compile-time computation instead of code generation | `rust-const` |
| Errors raised by the generated code | `rust-error` |
| Macro generates an FFI surface | `rust-ffi` |

## Playbook

1. **Try to delete the macro.** A generic function, a trait, a `const fn`, or a builder usually
   expresses the same thing with better errors (`macro-prefer-functions`). Done when you can name
   the caller-side syntax that no function can accept.
2. **Pick the smallest mechanism.**

   | Need | Mechanism |
   |---|---|
   | Fixed syntax sugar, tokens known at write time | `macro_rules!` |
   | Trait impl derived from a type's shape | `#[derive]` proc macro |
   | Rewrite or wrap an existing item | attribute proc macro |
   | Items generated from a call expression | function-like proc macro |

   Done when the choice cannot be expressed by a cheaper row above it.
3. **`macro_rules!` hygiene.** Keep one exported matcher set, hide recursive arms behind `@internal`,
   use `$crate::` for every path into the defining crate, and never bind a local the caller can
   see. Done when an integration test uses the macro from a *different* crate and compiles.
4. **Match the narrowest fragment.** `$e:expr` swallows everything and blocks follow-on operators;
   prefer `$i:ident`, `$t:ty`, `$p:pat`, `$tt` for a token bag, and `$($x:expr),+ $(,)?` for lists.
   Done when an unexpected token produces a parse error and not a downstream type error.
5. **Proc macro: parse with `syn`, emit with `quote!`.** Keep the crate `proc-macro = true` and
   free of logic that deserves unit tests; put that in a sibling crate. Done when the macro crate
   contains only entry points and `quote!` calls.
6. **Errors carry spans.** Return `syn::Error::new_spanned(...).to_compile_error()` instead of
   panicking. Done when `trybuild` UI tests pin the message *and* the underlined tokens.
7. **Review the expansion.** `cargo expand` the call site and read it as if a human had written it:
   qualified paths, no injected `use`, no duplicate trait impls. Done when the expansion compiles
   with zero imports added at the call site.

## Examples

```rust
#[doc(hidden)]
pub mod __private {
    pub fn assert_flag(name: &str, value: bool) {
        assert!(value, "flag `{name}` was not set");
    }
}

#[macro_export]
macro_rules! require_flags {
    ($flags:expr, $($name:ident),+ $(,)?) => {{
        let flags = $flags;                       // caller's expression, evaluated once
        $(
            // `$crate` resolves in the *defining* crate; a bare `crate::` breaks downstream.
            $crate::__private::assert_flag(stringify!($name), flags.$name);
        )+
    }};
}
```

```rust
// crate: my-derive   (Cargo.toml: [lib] proc-macro = true)
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

#[proc_macro_derive(Describe)]
pub fn describe(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
    let name = &ast.ident;
    // Fully-qualified path: the expansion needs nothing imported at the call site.
    quote! {
        impl #name {
            pub const TYPE_NAME: &'static str = stringify!(#name);
        }
    }
    .into()
}
```

```rust
// my-derive, same crate as above: the imports are unchanged.
#[proc_macro_derive(Bounded, attributes(bound))]
pub fn bounded(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
    match expand(&ast) {
        Ok(tokens) => tokens.into(),
        // Point the diagnostic at the user's tokens, not at this crate.
        Err(err) => err.to_compile_error().into(),
    }
}
```

## Hard rules

- Macros are syntax, not abstraction: if a function can express it, write the function.
- `$crate::` on every path into the defining crate; `crate::` silently breaks every downstream user.
- A proc macro never `panic!`s to report a user error — it returns `syn::Error` with the offending
  span.
- Generated items live behind `#[doc(hidden)] pub mod __private`; the expansion adds no `use` items
  and no caller-visible bindings.
- `macro_rules!` hygiene protects locals you introduce; identifiers passed as `$name:ident` come
  from the caller on purpose.

## Done when

- `cargo expand` shows an expansion that compiles unchanged in a downstream crate
- `trybuild` UI tests pin every rejection with the right span
- the macro crate holds no testable logic, and the sibling crate's unit tests cover the real work
- the expansion allocates and dispatches no more than hand-written code would
