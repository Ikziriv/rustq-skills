---
name: rust-xacml
description: Authorization decision engines in Rust — model subject/resource/action rules, climb RBAC → ABAC → ReBAC, and put one deny-by-default PDP behind a single PEP. Use when the user mentions xacml, policy, rbac, abac, permission, authorization decision, PDP, PEP, policy evaluation, deny-overrides, casbin, cedar, or asks where to enforce permissions, why a policy allows the wrong thing, or whether to embed an engine or write typed rules.
---

# Authorization Policy Engines

XACML is an answer, not the question. The question is the **decision**: given a subject, a resource,
an action and a context, permit or deny, plus any obligation that rides along. **Leading word:
decision.** `rust-auth` verifies the principal; this skill decides what it may do, and no engine fixes
a model that checks permissions in five places or defaults to allow.

## Route first

| Concern | Go to |
|---|---|
| Rule text: validated ids, enums over booleans, error types, log fields | `rust-skills` → `type-newtype-validated`, `type-enum-states`, `err-custom-type`, `obs-structured-fields`, `api-must-use` |
| The workflow for the handler being written | `rust-skill` |
| Who the principal is: tokens, claims, sessions | `rust-auth` |
| Where the check is mounted: layer, extractor, per-route | `rust-middleware` |
| A deny turned into 403 vs 404, and its body | `rust-web` |
| Deny vs evaluation failure in the error taxonomy | `rust-error`, `rust-error-advanced` |
| Auditing denies, decision metrics, span fields | `rust-observability` |
| The role × action matrix as a table test | `rust-testing` |
| Roles, scopes and attributes as types rather than strings | `rust-type-driven` |

Keep XACML's vocabulary even when you reject its XML: the **PEP** enforces at the boundary, the **PDP**
decides, a **PIP** supplies attributes, a **PAP** authors and versions policy. Its combining algorithms
— deny-overrides, permit-overrides, first-applicable — are what you end up reimplementing anyway, so
name the one you chose.

## Playbook

1. **Write the decision tuple first.** Every check is `(principal, action, resource, context) → Decision`.
   *Done when* no permission check lacks one of the four, and `context` is an explicit struct rather
   than a grab-bag of optional arguments.
2. **Pick the weakest model that expresses the rule.** Roles for job-shaped access; attributes when the
   answer depends on the resource (`owner_id == principal`, tenant, clearance); relationships only when
   the answer needs a graph walk. *Done when* no rule reads an attribute it does not need, and none
   needs a traversal it cannot do locally.
3. **Choose an engine for the shape of the rules, not for the acronym.**

   | Situation | Reach for |
   |---|---|
   | A few dozen rules owned by this service | typed Rust data and one `match` |
   | Policy-as-code with a Rust-native evaluator | `cedar-policy` |
   | Team already writes `model.conf` / `policy.csv` | `casbin-rs` |
   | Policy owned outside the service, written in Rego | embedded Rego (`regorus`) behind one trait |
   | A spec mandates the XACML 3.0 XML profile | an external PDP behind a client trait |

   Crate maturity moves; check current docs before committing. The full XACML XML profile is a heavy
   fit for a Rust service and has no mainstream crate, so a mandated one is an integration problem,
   not a modelling one. *Done when* the engine sits behind one trait and a test can swap a fake in.
4. **One decision point per request.** *Done when* a grep finds one call into the engine per operation
   and no inline `if role == "admin"` survives beside it.
5. **Deny by default.** Unknown action, unknown resource, missing attribute, no matching rule: all deny.
   *Done when* an empty rule set denies, and a test asserts it.
6. **Cache the decision, versioned.** Key on `(principal, action, resource, the context the policies
   actually read, policy_version)`; a deploy changes the version, so stale permits die by construction.
   Anything time-dependent must be in the key or uncached. *Done when* a policy-version bump cannot
   serve a permit decided before the deploy.
7. **Obligations are effects, not verdicts.** "Log this access", "mask field 3": apply them after the
   decision, and treat a failed obligation as a deny or a loud error — never as a quiet permit.
   *Done when* obligation failure has its own test.
8. **Test the matrix.** One table: role or attribute × action × expected verdict, including a
   conflicting-policy case that proves the combining algorithm. *Done when* deleting any single permit
   rule turns at least one row red.

## Examples

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision { Permit, Deny }

#[derive(Clone, PartialEq, Eq, Hash)] pub struct PrincipalId(String);
#[derive(Clone, PartialEq, Eq, Hash)] pub struct ResourceId(String);
#[derive(Clone, Copy, PartialEq, Eq, Hash)] pub enum Action { Read, Write, Admin }

pub struct Request<'a> {
    pub principal: &'a PrincipalId,
    pub action: Action,
    pub resource: &'a ResourceId,
    pub tenant: &'a str, // context: exactly the fields the rules read
}

/// `None` = this rule does not apply. Total over `Action`: no stringly-typed verbs.
pub trait Rule: Send + Sync {
    fn evaluate(&self, req: &Request<'_>) -> Option<Decision>;
}

pub struct Engine { rules: Vec<Box<dyn Rule>>, version: u64 } // version: bumped on deploy
```

```rust
impl Engine {
    /// Deny-overrides, and deny when nothing matched.
    pub fn decide(&self, req: &Request<'_>) -> Decision {
        let mut permitted = false;
        for rule in &self.rules {
            match rule.evaluate(req) {
                Some(Decision::Deny) => return Decision::Deny, // a single deny wins
                Some(Decision::Permit) => permitted = true,
                None => {}
            }
        }
        if permitted { Decision::Permit } else { Decision::Deny }
    }
}

// The key carries the policy version, so a deploy invalidates every cached permit.
#[derive(Clone, PartialEq, Eq, Hash)]
struct CacheKey {
    principal: PrincipalId,
    action: Action,
    resource: ResourceId,
    tenant: String,
    policy_version: u64,
}
```

## Hard rules

- Deny by default: an unmatched request is a deny, never an allow and never an "unknown" treated as one.
- One decision point per operation; a second guard added for convenience is a bypass route.
- The cache key carries the policy version and every context field a policy reads.
- Obligations run after the verdict; a failed obligation never silently upgrades a deny into a permit.
- XACML XML is an integration constraint, not a design: adopt it only when a spec or external PDP forces it.

## Done when

- every protected operation routes through one engine call, and removing a permit rule breaks a test
- the role/attribute × action matrix exists as a table test, with a conflicting-policy case
- a policy-version bump cannot serve a permit decided before the deploy
- every deny emits an audit record with principal, action, resource and the deciding rule id
