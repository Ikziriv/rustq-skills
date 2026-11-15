---
name: rust-auth
description: Implement JWT and API-key authentication in Rust services — claims and validation, key rotation, password hashing with argon2, refresh and revocation, and constant-time secret comparison. Use when the user mentions auth, authentication, authorization, JWT, bearer token, claims, API key, password hashing, argon2, refresh token, key rotation, or asks to protect an endpoint, verify a token, revoke a session, or store secrets safely.
---

# JWT & API-Key Auth

The unit is a **claim**: who is asking, what they may do, and how long that answer stays true. Every
token is a cached assertion — the security work is in what you verify and how long you trust it.

Out of scope here: OAuth2/OIDC provider flows, mTLS, and password-reset delivery — those follow the
provider's specification, not a snippet.

## Route first

| Concern | Go to |
|---|---|
| Rule text for errors, newtypes, sensitive fields | `rust-skills` (`err-*`, `api-newtype-safety`, `type-newtype-validated`, `obs-no-sensitive-data`) |
| The workflow for the service behind the check | `rust-skill` |
| Attaching the check to every route, CORS, rate limits | `rust-middleware` |
| Storing sessions, refresh tokens and key hashes | `rust-database` |
| What may appear in logs and spans | `rust-observability` |
| Turning auth failures into 401/403 responses | `rust-web` |
| Constant-time comparison, crypto primitives, FFI wrappers | `rust-unsafe` |
| Caching identity or session lookups | `rust-cache` |

## Playbook

1. **Separate the two contracts.** Authentication answers "who", authorization answers "may they".
   Write the required role or scope per route first. *Done when* each protected route has a test for
   401 (no or bad credential) and 403 (valid credential, insufficient scope).
2. **Model the principal as a type.** `struct UserId(i64)`, `struct Claims { .. }` — never a bare
   `String` identity through layers (`type-newtype-validated`). *Done when* no handler takes a
   `String` caller id.
3. **Verify before reading.** Allow-list the algorithm, check `exp`, `nbf`, `iss`, `aud`, and select
   the key by the `kid` header. *Done when* tests reject `alg: none`, a token signed with another
   algorithm, an expired token, and a wrong issuer.
4. **Rotate keys by `kid`.** Keep old verification keys for at least the maximum token lifetime;
   sign only with the newest. *Done when* a test validates a token signed by the previous key while
   new tokens use the current one.
5. **Hash passwords with argon2.** Crate defaults, per-password salt, PHC string in storage, verify
   with the library — never `==`. *Done when* a wrong password fails, and an unknown user takes a
   comparable amount of time (verify against a dummy hash).
6. **Treat API keys as bearer secrets.** High-entropy, prefixed, shown once, stored only as a
   digest with a lookup id, compared in constant time. *Done when* no plaintext key is ever persisted.
7. **Design revocation in.** Short access tokens, single-use refresh tokens with server-side state,
   a `jti` or session id per token. *Done when* a revoked refresh token fails a test and logout
   invalidates the session without waiting for expiry.
8. **Fail closed.** Missing or invalid credential → 401 with `WWW-Authenticate`; insufficient scope
   → 403; no default-allow and no dev bypass compiled into release builds.

## Examples

```rust
use jsonwebtoken::{Algorithm, Validation, decode, decode_header};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String, // stable user id, never an email
    exp: usize,  // seconds since the epoch; `Validation` requires it
    iss: String,
    scope: String,
}

fn verify(token: &str, keys: &KeyRing) -> Result<Claims, AuthError> {
    let header = decode_header(token).map_err(|_| AuthError::Invalid)?;
    let key = keys.get(header.kid.as_deref()).ok_or(AuthError::UnknownKey)?;

    let mut validation = Validation::new(Algorithm::EdDSA); // allow-list, never default()
    validation.set_issuer(&["https://auth.example.com"]);
    validation.set_audience(&["api"]);
    validation.leeway = 0;

    decode::<Claims>(token, key, &validation)
        .map(|data| data.claims)
        .map_err(|_| AuthError::Invalid) // reason stays in logs, not in the response
}
```

```rust
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng}};

fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    // PHC string: algorithm, params, salt, hash — store it as-is
    Ok(Argon2::default().hash_password(password.as_bytes(), &salt)?.to_string())
}

fn verify_password(password: &str, stored: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(stored) else { return false };
    Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok()
}
```

```rust
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

// Store only the digest; look the row up by key id, then compare in constant time.
fn api_key_matches(presented: &str, stored_digest: &[u8; 32]) -> bool {
    let digest = Sha256::digest(presented.as_bytes());
    digest.as_slice().ct_eq(stored_digest).into()
}
```

`jsonwebtoken` and `argon2` both changed signatures within recent major lines — check current docs
before copying. `DecodingKey::from_ed_pem` reads PEM keys; HS256 secrets need 32+ random bytes.

## Hard rules

- Never log, trace, or return a token, password, API key, or full claim set — log a hash or an id
  (`obs-no-sensitive-data`).
- Compare secrets and digests in constant time, never with `==` on attacker-controlled input.
- Allow-list the algorithm and verify `exp`, `iss`, `aud` before reading any claim.
- A bearer token travels only over TLS and never in a URL or query string.
- Fail closed: no default-allow, no "dev bypass" reachable in a release build.

## Done when

- tests reject missing credentials, expired tokens, wrong algorithm, wrong issuer, revoked tokens
- a rotation test accepts the previous `kid` and signs new tokens with the current one
- plaintext secrets appear in no table, fixture, log line, or trace field
- every protected route has both a 401 and a 403 test
