<!-- alex disable fire -->

<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-1password`

1Password plugin for [Holocron](../cli). Implements the `vault`
capability via shell-out to the `op` CLI
(<https://developer.1password.com/docs/cli>). Also exports
`verifyToken` + `AUTH_HINT` for use by `holocron check token`.

## One of several vault providers

`vault` is a REQUIRED capability, but 1Password is one of several
providers you can pick — the capability/provider model is designed
so you can swap by editing one config line. Peer plugins:

- **[`@theholocron/holocron-plugin-doppler`](../holocron-plugin-doppler)**
  — REST-transport, Doppler-CLI-managed auth via the OS keychain
  (`doppler login` → `holocron new token doppler …`). This repo's
  own default since `2.0.0-alpha.4`.
- **`@theholocron/holocron-plugin-infisical`** — planned (see [#97](https://github.com/theholocron/holocron/issues/97)),
  will use the same REST + keyring shape.

### When to choose 1Password

Reach for this plugin if:

- Your existing personal / team secrets already live in 1Password
  and adding another vault provider is real friction.
- You value 1Password's biometric-first UX for laptop workflows
  over the "REST + keyring" ergonomic set that the other plugins
  offer.
- You're comfortable running the `op` CLI on every machine that
  needs to reach your secrets — including CI, where you'd set
  `OP_SERVICE_ACCOUNT_TOKEN` instead of the biometric flow.

Reach for one of the REST plugins (Doppler / Infisical) instead
when you want:

- Zero desktop-app dependency (Doppler-CLI on the laptop still
  needed; nothing on CI beyond a bearer token).
- 100% REST transport across every capability call (this plugin
  shells out per operation).
- A vault whose API you can reach without unlocking anything.

Both patterns are fully supported — switch by editing
`holocron.config.json`.

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-1password@alpha

```

Requires the `op` binary on PATH (see [Prerequisite](#prerequisite)).

## Why shell-out, not REST

1Password's "REST API" is the **Connect server** — a Docker container
you have to run yourself (or pay for the cloud-hosted version). For
a solo / small-team workflow, that's overkill. The `op` CLI is what
every developer already has installed and uses for hand-debugging
anyway, so:

- **Local dev**: developer's signed-in `op` CLI (biometric unlock
  via the desktop app).
- **CI**: `OP_SERVICE_ACCOUNT_TOKEN` env var; `op` auto-detects it.
- **Either way**: same binary, same commands, same code path.

The plugin's job is to drive the CLI; auth handling is the
CLI's.

## Prerequisite

The `op` binary must be on PATH. Install:

<!-- prettier-ignore -->
```bash
brew install 1password-cli   # macOS
# or follow https://developer.1password.com/docs/cli/get-started

```

The plugin throws a clear error at construction time if `op` isn't
found.

## Auth

This plugin does NOT store a bearer token — the `op` CLI manages
its own auth via the 1Password desktop app (biometric unlock on
laptops) or `OP_SERVICE_ACCOUNT_TOKEN` on CI. `holocron new token
1password` will accept a token, but since the plugin doesn't read
the keyring, storing one has no runtime effect. The `AUTH_HINT`
export makes this explicit in `holocron check token` output.

`holocron check token 1password` runs `op whoami --format=json` to
confirm you're signed in — a useful validation independent of
holocron.

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "vault": [
      "1password",
      {
        "vault": "rando", // 1P vault name
        "account": "ABCDEFGHIJKLMNOPQRSTUVWXYZ", // optional: 1P account UUID
      },
    ],
  },
}

```

- `vault` (optional) — the 1Password vault name items live in. `list()` needs it, or an `environment` (see below) (`read` and `write` take the vault from the `op://` reference), and Environments are not in a vault, so a project that only reads an Environment can leave it out.
- `account` (optional) — 1P account UUID. Passes `--account <UUID>`
  on every `op` call so the integration targets a specific account
  even when the developer has multiple signed in (e.g., work +
  personal). Find via `op account list`.

## What's implemented

| Method                        | What it does                                                                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read(reference)`             | `op read <reference>` — resolves `op://Vault/Item/field`. `--no-newline`.                                                                                                                                                                                                   |
| `write(reference, v)`         | Probe + `op item edit` if exists, else `op item create --category=API Credential`.                                                                                                                                                                                          |
| `list()`                      | `op item list --vault=<vault> --format=json` — names of items in the vault; with only an `environment` set, the variable names of that Environment (`setup` calls it). Neither is an error.                                                                                 |
| `readSecret(name)`            | Reads one variable of the Environment named by the `environment` option, through the same `op environment secret list`; refuses without that option. Lets a caller (the `comlink deliver` probe) ask for a secret by its bare name.                                         |
| `readEnvironment(name or id)` | `op environment secret list <name or id> --reveal --format=dotenv` — parses the variables into a record (a multi-line PEM key, which `op` prints unquoted, is read whole). `op environment read` takes only an id, so this reads through `secret list`, which takes either. |

Plugin-level exports (not capability methods, per the auth-bootstrap
convention):

| Export        | Purpose                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `verifyToken` | `op whoami --format=json` — token arg ignored (see [Auth](#auth)). Returns `ok: true` when signed in.       |
| `AUTH_HINT`   | Explains the `op signin` / `OP_SERVICE_ACCOUNT_TOKEN` model to operators — 1P has no bearer token to store. |

### Not implemented (deliberately)

`ensureProject` / `ensureEnvironment` — 1Password's data model
doesn't have projects with sub-configs the way Doppler / Infisical
do. The vault + item hierarchy is created via the 1P UI or `op item
create`, not via `holocron setup`. The methods are omitted;
`runSetup` skips them cleanly (see the [`Vault`
interface](../cli/src/capabilities/index.ts)).

## Status

**`v2.0.0-alpha.1`** (or later — check [releases](https://github.com/theholocron/holocron/releases)).
Published on npm under the `alpha` dist-tag. APIs may still shift
before stable v2.0.0.

Implementation note: the stdio shape (`['inherit', 'pipe', 'pipe']`)
is critical — it gives `op` a TTY signal so it can fire the desktop
biometric unlock dialog when running locally. CI runs see no TTY and
fall back to whatever auth mode the env var configures.
