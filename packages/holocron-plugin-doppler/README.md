# `@theholocron/holocron-plugin-doppler`

Doppler plugin for [Holocron](../cli). Implements the `vault`
capability against [Doppler's REST API](https://docs.doppler.com/reference/api),
plus exports `verifyToken` + `AUTH_HINT` for use by `holocron auth`.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-doppler@alpha
```

## Auth

Token resolution order (matches the standard 4-step precedence set by
`.notes/tech-auth-bootstrap.spec.md`):

1. `--token <TOKEN>` flag on the holocron invocation
2. `HOLOCRON_DOPPLER_TOKEN` env var (preferred — explicit intent)
3. `DOPPLER_TOKEN` env var (Doppler-native, works in CI)
4. **Keyring** — `com.theholocron.cli` service, account `doppler`
5. `AuthError` naming all four options + the bootstrap hint

## Manual setup (one-time, per operator)

Doppler's free tier does not expose Service Accounts (Team+ only). Use
a Personal Token or CLI token instead.

```bash
# 1. Install the Doppler CLI
brew install dopplerhq/cli/doppler

# 2. Log in (opens a browser). Token lands in ~/.doppler/.doppler.yaml
#    → OS keychain, managed by the Doppler CLI.
doppler login

# 3. Hand the token off to holocron's keyring (one-shot). After this,
#    every plugin call reads the token from the keyring — no env vars
#    to remember, no dotfiles to sync.
holocron auth set doppler $(doppler configure get token --plain)

# 4. Verify:
holocron auth check doppler
```

**CI**: the keyring is not available in headless containers. Expose
the token as a GitHub Actions secret and set `HOLOCRON_DOPPLER_TOKEN`
(or `DOPPLER_TOKEN`) in the workflow env. Steps 1–3 of the auth
precedence still work; step 4 quietly falls through.

## Config

```jsonc
{
	"providers": {
		"vault": ["doppler", { "project": "my-app", "config": "dev" }],
	},
}
```

- `project` (required) — Doppler project name. `read` / `list` /
  bootstrap operations default to this project.
- `config` (required) — Doppler config name (usually `dev`, `stg`, or
  `prd`). `list()` reads secrets from this config.

Individual `read` / `write` calls take a fully-qualified reference:

```
doppler://<project>/<config>/<name>
```

The default project + config in options apply to `list()`,
`environments()`, and `readEnvironment()` where a three-part
reference doesn't make sense.

## What's implemented

| Method              | Behavior                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `read`              | `GET /v3/configs/config/secret?project&config&name`. Returns `value.computed` when present, else `value.raw`.             |
| `write`             | `POST /v3/configs/config/secrets` with `{ project, config, secrets: {name: value} }`. Doppler's native upsert — no probe. |
| `list`              | `GET /v3/configs/config/secrets` on the default project + config.                                                         |
| `environments`      | `GET /v3/environments?project`. Returns environment slugs (`dev`/`stg`/`prd`).                                            |
| `readEnvironment`   | `GET /v3/configs/config/secrets/download?format=json` — bulk KEY=VALUE dump for `holocron secrets sync`.                  |
| `ensureProject`     | `POST /v3/projects`, treats 409/422 "already exists" as idempotent no-op.                                                 |
| `ensureEnvironment` | `POST /v3/environments`, same idempotency semantics.                                                                      |

Plugin-level exports (not capability methods, per the auth-bootstrap
convention):

| Export        | Purpose                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `verifyToken` | `GET /v3/me` — returns `{ok: true, subject: "personal @ acme"}` or `{ok: false, message}`.  |
| `AUTH_HINT`   | One-line hint printed by `holocron auth set` when no token is supplied or the token is bad. |

## Status

**`v2.0.0-alpha.1`** — published on npm under the `alpha` dist-tag.
APIs may still shift before stable v2.0.0.
