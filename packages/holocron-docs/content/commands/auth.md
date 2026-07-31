---
title: "auth"
description: Manage bootstrap credentials in the OS keyring.
---

The `auth` command stores, verifies, and removes provider tokens in the OS credential store (macOS Keychain, Windows Credential Manager, or libsecret on Linux). Tokens stored here are picked up automatically by all other commands.

## Subcommands

### `auth set <provider> [value]`

Verify a token and store it in the keyring.

```bash
holocron auth set github.admin  ghp_xxx
holocron auth set github.read   ghp_yyy
holocron auth set vercel        v_xxx
holocron auth set doppler       dp.st.xxx
```

If `value` is omitted, the CLI reads from:

1. `HOLOCRON_<PROVIDER>_TOKEN` env var (uppercased, dots replaced with underscores)
2. `<PROVIDER>_TOKEN` vendor-native env var

```bash
# Read from env
HOLOCRON_GITHUB_ADMIN_TOKEN=ghp_xxx holocron auth set github.admin
```

The command dynamically loads the corresponding plugin (`@theholocron/holocron-plugin-<provider>`) and calls its `verifyToken` export before storing. If verification fails, the token is rejected with an explanation.

**1Password note:** `holocron auth set 1password` does not store a token — the `op` CLI manages its own auth. The command prints the `AUTH_HINT` instead.

### `auth unset <provider>`

Remove a stored token from the keyring.

```bash
holocron auth unset github.read
holocron auth unset vercel
```

### `auth check <provider>`

Re-verify a stored token without re-prompting for a new one. Useful for confirming a token hasn't expired.

```bash
holocron auth check github.admin
```

Exits with code 1 if the token is missing, expired, or rejected by the provider.

### `auth list`

List every provider that has a stored token in the keyring.

```bash
holocron auth list
```

Output example:

```
github.admin   ✓ stored
github.read    ✓ stored
vercel         ✓ stored
```

## Provider names

| Provider name    | Plugin                                                |
| ---------------- | ----------------------------------------------------- |
| `github.admin`   | `@theholocron/holocron-plugin-github` (admin token)   |
| `github.read`    | `@theholocron/holocron-plugin-github` (read token)    |
| `github.issues`  | `@theholocron/holocron-plugin-github` (issues token)  |
| `github.sync`    | `@theholocron/holocron-plugin-github` (sync token)    |
| `github.release` | `@theholocron/holocron-plugin-github` (release token) |
| `vercel`         | `@theholocron/holocron-plugin-vercel`                 |
| `doppler`        | `@theholocron/holocron-plugin-doppler`                |
| `infisical`      | `@theholocron/holocron-plugin-infisical`              |
| `clerk`          | `@theholocron/holocron-plugin-clerk`                  |
| `neon`           | `@theholocron/holocron-plugin-neon`                   |
| `postman`        | `@theholocron/holocron-plugin-postman`                |

See the [Token Reference](../tokens) for the env var names and PAT scopes each token needs.
