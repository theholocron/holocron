---
id: ADR-0003
title: "Auth bootstrap — OS keyring as fourth-precedence token layer"
status: accepted
date: 2026-08-17
owners: []
specs:
  - .notes/archive/tech-auth-bootstrap.spec.md
discussion:
  github:
supersedes: []
superseded-by: []
tags: [auth, keyring, plugins, security]
---

# Auth bootstrap — OS keyring as fourth-precedence token layer

* Status: accepted
* Date: 2026-08-17

## Context and Problem Statement

Every holocron plugin needs a vendor credential to reach its API. The
credential cannot live in the vault the plugin is authenticating against
(chicken-and-egg). Prior to v2, the 1Password plugin handled this via the
`op` desktop app's biometric flow; all other plugins required operators to
store tokens in env vars or shell profiles — creating an inconsistent,
insecure credential management story across plugins.

## Decision Drivers

* Consistent credential UX across all plugins
* No shell-out to vendor CLIs for bootstrap (avoids `op`, `doppler run`, etc.)
* Must work in CI (env var or flag) and locally (ergonomic persistent store)
* No per-project scoping at the auth layer — that belongs in `holocron.config.json`

## Considered Options

* **Shell out to vendor CLI** — delegate to `op`, `doppler configure get token`, etc.
* **Env-var only** — operators set `HOLOCRON_<X>_TOKEN` or vendor-native env var
* **OS keyring as managed store** — `holocron auth <provider>` writes once; plugins read via `@napi-rs/keyring`

## Decision Outcome

Chosen option: **OS keyring as a new fourth-precedence layer**, because it
gives every plugin the same UX, requires no per-vendor CLI, and degrades
gracefully to env vars or flags in CI.

The full precedence order for every plugin:

```
1. --token             CLI flag (per-command override)
2. HOLOCRON_<X>_TOKEN  holocron-namespaced env var
3. <VENDOR>_TOKEN      vendor's own env var
4. keyring             com.theholocron.cli service, key = <provider>
→  AuthError           with a vendor-specific recovery hint
```

### Positive Consequences

* Operators `holocron auth set <provider> <token>` once; it persists across sessions
* All plugins resolve credentials via the same `resolveToken()` helper
* CI continues to use env vars (steps 2–3); keyring is never consulted in CI
* `AuthError` names all four resolution paths with a vendor-specific hint

### Negative Consequences

* Requires `@napi-rs/keyring` — Rust-based N-API prebuilts, one extra native dependency
* Keyring availability varies by OS (macOS Keychain, Linux Secret Service, Windows Credential Manager)

## Pros and Cons of the Options

### Shell out to vendor CLI

* Good, because vendor CLIs already handle their own credential lifecycle
* Bad, because reintroduces CLI-transport dependency we're removing from plugins
* Bad, because each vendor has a different CLI, different output format, different install requirement

### Env-var only

* Good, because universally portable, no native dependencies
* Bad, because operators must set and maintain env vars in shell profiles or dotfiles
* Bad, because no ergonomic local-dev UX — every new shell session requires re-export

### OS keyring as managed store

* Good, because cross-plugin consistency — one `resolveToken()` helper, one UX
* Good, because `@napi-rs/keyring` uses Rust prebuilts — no node-gyp, actively maintained
* Good, because `keytar` (archived) is not used
* Bad, because native dependency; headless environments need `libsecret` (Linux)
