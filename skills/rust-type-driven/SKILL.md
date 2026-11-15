---
name: rust-type-driven
description: Type-driven design in Rust — turn each invariant into a type so that invalid values and illegal transitions stop compiling, using newtypes, typestate, sealed traits and PhantomData markers. Use when the user mentions typestate, newtype, `PhantomData`, sealed traits, parse-don't-validate, or making illegal states unrepresentable; or asks how to stop passing raw ids and units around, how to enforce a workflow order at compile time, or how to expose a trait nobody outside the crate can implement.
---

# Type-Driven Design

A value is a **witness**: if it exists, its invariant holds. **Leading word: witness.** Design work
is deciding which facts the type system should hold, so that no runtime check has to be believed.

## Route first

| Concern | Go to |
|---|---|
| Rule text (`api-typestate`, `api-parse-dont-validate`, `api-newtype-safety`, `api-sealed-trait`, `type-newtype-ids`, `type-enum-states`, `type-phantom-marker`) | `rust-skills` |
| Whole-module workflow, public API surface | `rust-skill` |
| A marker that lies about `Send`/`Sync` or variance | `rust-unsafe` |
| The value the newtype wraps, and who owns it | `rust-ownership` |
| `PhantomData` carrying the pinning invariant | `rust-pin` |
| Marker lifetimes, variance, `dyn Trait + 'a` | `rust-lifetime-complex` |
| Size/count encoded as a const parameter | `rust-const` |
| The parse error type and its `From` impls | `rust-error` |
| Generated impls for the family (derive macros) | `rust-macro` |

## Playbook

1. **Write the invariants in prose.** "valid email", "amount ≥ 0", "an article is editable only
   before publication". Done when each is a predicate on data, not on a call sequence.
2. **Data invariants → private field + validating constructor.** One `parse`/`try_new` that runs the
   check; every other path takes the type. Done when no `pub` field and no second constructor can
   produce an invalid value (`api-parse-dont-validate`).
3. **Sequence invariants → typestate or enum.** Replace `state: Kind` plus `Option<T>` fields with
   distinct types (transitions consume `self`) or one enum whose variants carry the data. Done when
   a `match` arm, not an `if`, distinguishes the states (`api-typestate`, `type-enum-states`).
4. **Identity and units → newtypes.** `UserId(u64)` vs `OrderId(u64)`, `Cents(i64)` vs `Millis(u64)`.
   Done when swapping two arguments of the same underlying type stops compiling
   (`type-newtype-ids`, `api-newtype-safety`).
5. **Markers only for real properties.** Each `PhantomData<T>` states ownership, variance,
   `Send`/`Sync` or drop-check; a marker that exists to silence an unused type parameter means the
   parameter belongs on the trait or nowhere (`type-phantom-marker`).
6. **Closed sets → sealed trait.** `pub trait Codec: private::Sealed` is callable but not
   implementable downstream (`api-sealed-trait`). Done when an out-of-crate `impl` fails.
7. **Keep the encoding free.** `#[repr(transparent)]` newtypes, explicit `TryFrom`/`From`
   conversions, no `pub` tuple field. Done when no `.0` appears in a public signature.

## Examples

```rust
#[derive(Clone)]
pub struct Email(String); // private field: a constructor is the only way in

impl Email {
    pub fn parse(raw: &str) -> Result<Self, EmailError> {
        let at = raw.find('@').ok_or(EmailError::MissingAt)?;
        if at == 0 || at + 1 == raw.len() {
            return Err(EmailError::MissingParts);
        }
        Ok(Self(raw.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}
```

```rust
use std::marker::PhantomData;

pub struct Draft;
pub struct Published;

pub struct Article<State> { title: String, _state: PhantomData<State> }

impl Article<Draft> {
    pub fn new(title: impl Into<String>) -> Self {
        Self { title: title.into(), _state: PhantomData }
    }

    // Consumes `self`: the draft handle cannot be used again after publishing.
    pub fn publish(self) -> Article<Published> {
        Article { title: self.title, _state: PhantomData }
    }
}

impl Article<Published> {
    pub fn title(&self) -> &str { &self.title }
}
// `Article<Draft>::title` does not exist, so reading an unpublished article is a compile error.
```

```rust
/// The unit lives in the type: a `Cents` cannot be passed where `Millis` is expected.
#[repr(transparent)]
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Cents(i64);

pub struct NegativeAmount;

impl TryFrom<i64> for Cents {
    type Error = NegativeAmount;

    fn try_from(value: i64) -> Result<Self, Self::Error> {
        if value < 0 { Err(NegativeAmount) } else { Ok(Self(value)) }
    }
}
```

## Hard rules

- An invariant checked at call sites is not enforced; the checked type is the only currency, field private.
- State lives in the type, not in a `bool` flag with runtime guards — if a `match` cannot tell two
  states apart, the type is not doing the work.
- `PhantomData` marks a real property (ownership, variance, auto-trait, drop-check); it is never a
  substitute for a `where` clause.
- Sealing is `pub trait: private::Sealed`, not `#[doc(hidden)]`: documentation is not access control.
- Newtypes are `#[repr(transparent)]` with explicit conversions; no constructor skips validation and
  no public field exposes the raw value.

## Done when

- each invariant appears exactly once, in a constructor, and removing that check still compiles
- no public signature takes a raw `String`/`u64` where a newtype exists
- a compile-fail test (`trybuild`) shows the illegal state or transition is rejected
- no runtime assertion duplicates a guarantee the type already provides
