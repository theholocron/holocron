# `@theholocron/holocron-plugin-1password`

1Password plugin for [Holocron](../cli). Implements the **required**
`vault` capability via shell-out to the `op` CLI
(<https://developer.1password.com/docs/cli>).

## Why shell-out, not REST

1Password's "REST API" is the **Connect server** — a Docker container
you have to run yourself (or pay for the cloud-hosted version). For a
solo / small-team workflow, that's overkill. The `op` CLI is what every
developer already has installed and uses for hand-debugging anyway, so:

- **Local dev:** developer's signed-in `op` CLI (biometric unlock via
  the desktop app)
- **CI:** `OP_SERVICE_ACCOUNT_TOKEN` env var; `op` auto-detects it
- **Either way:** same binary, same commands, same code path

The plugin's job is just to drive the CLI; auth handling is the CLI's.

## Prerequisite

The `op` binary must be on PATH. Install:

```bash
brew install 1password-cli   # macOS
# or follow https://developer.1password.com/docs/cli/get-started
```

The plugin throws a clear error at construction time if `op` isn't
found.

## Config

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

- `vault` (required) — the 1Password vault name items live in.
- `account` (optional) — 1P account UUID. Passes `--account <UUID>` on
  every `op` call so the integration targets a specific account even
  when the developer has multiple signed in (e.g., work + personal).
  Find via `op account list`.

## What's implemented

| Method                  | What it does                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `read(reference)`       | `op read <reference>` — resolves `op://Vault/Item/field`. `--no-newline`.                      |
| `write(reference, v)`   | Probe + `op item edit` if exists, else `op item create --category=API Credential`.             |
| `list()`                | `op item list --vault=<vault> --format=json` — names of items in the vault.                    |
| `environments()`        | `op environment list --format=json` — names of 1P Environments.                                |
| `readEnvironment(id)`   | `op environment read <id>` — parses KEY=VALUE lines into a record.                             |
| `whoami()` (via doctor) | `op whoami --format=json` — tolerates the JSON-shape drift across CLI versions and auth modes. |

## Status

**v0.0.0 — first port.** Ports `rando-id/rando.id`
`adapters/op-cli.ts`. The stdio shape (`['inherit', 'pipe', 'pipe']`)
is critical: it gives `op` a TTY signal so it can fire the desktop
biometric unlock dialog when running locally. CI runs see no TTY and
fall back to whatever auth mode the env var configures.
