---
title: 1Password Plugin
description: Implements the vault capability via shell-out to the op CLI.
---

`@theholocron/holocron-plugin-1password` implements the `vault` capability by shelling out to the [1Password CLI (`op`)](https://developer.1password.com/docs/cli). All secret operations go through `op` — no bearer token is stored in Holocron's keyring.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-1password
```

The `op` CLI must be installed separately. Install it from [1password.com/downloads/command-line](https://1password.com/downloads/command-line/) or via Homebrew:

```bash
brew install --cask 1password/tap/1password-cli
```

## Capabilities

| Capability | Auth method                                                              |
| ---------- | ------------------------------------------------------------------------ |
| `vault`    | `op` CLI session (biometric on laptop; `OP_SERVICE_ACCOUNT_TOKEN` in CI) |

## Config

```ts
providers: {
  vault: ["1password", {
    // Required: 1Password vault name where items live
    vault: "acme-app",
    // Optional: 1P account UUID (--account flag on every op call)
    account: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  }],
}
```

### Options

| Option    | Required | Description                                                          |
| --------- | -------- | -------------------------------------------------------------------- |
| `vault`   | Yes      | 1Password vault name                                                 |
| `account` | No       | 1Password account UUID — useful when multiple accounts are signed in |

## Authentication

**On laptop:** Sign in via the 1Password desktop app or `op signin`. The plugin uses the active session automatically.

**In CI:** Set `OP_SERVICE_ACCOUNT_TOKEN` in the workflow environment:

```yaml
env:
  OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
```

`holocron auth set 1password` does not store a token — it prints the `AUTH_HINT` instead.

## Secret reference format

1Password item references follow the format `op://Vault/Item/field`:

```bash
# Read a secret
op://acme-app/database/password
```

In the `vault` capability this format is used with `vault.read(reference)`.

## What `vault` provides

- `read(reference)` — reads a secret by `op://Vault/Item/field` reference
- `write(reference, value)` — writes a secret value
- `list()` — lists available secret references in the configured vault
- `readEnvironment?(id)` — reads all KEY=VALUE pairs from a 1Password Environment item (supports `holocron secrets sync`)
- `ensureProject?(name)` — creates the top-level vault container if missing
- `ensureEnvironment?(project, name)` — creates an environment item inside a project
