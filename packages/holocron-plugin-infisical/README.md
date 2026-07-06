<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-infisical`

Infisical plugin for [Holocron](../cli). Implements the `vault`
capability against [Infisical's REST API](https://infisical.com/docs/api-reference/overview/introduction),
plus exports `verifyToken` + `AUTH_HINT` for use by `holocron auth`.

## One of several vault providers

`vault` is a REQUIRED capability but Infisical is one of several
providers you can pick. Peer plugins:

- **[`@theholocron/holocron-plugin-doppler`](../holocron-plugin-doppler)**
  — this repo's own default vault since `2.0.0-alpha.4`.
- **[`@theholocron/holocron-plugin-1password`](../holocron-plugin-1password)**
  — for teams already invested in 1Password's biometric UX.
- **This plugin** — for teams that want an open-source vault they
  can self-host later if desired.

Switch by editing `holocron.config.json`.

### When to choose Infisical

- You want an open-source vault with a clear path to self-hosting
  (the plugin's `baseUrl` option points at cloud today; swap it for
  your self-hosted URL later, no code changes).
- Machine-identity + Universal Auth token model matches your
  security posture better than dashboard-generated Personal Tokens.
- Your team already uses Infisical for other projects.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-infisical@alpha
```

## Auth

Token resolution order (matches the standard 4-step precedence set
by `.notes/tech-auth-bootstrap.spec.md`):

1. `--token <TOKEN>` flag on the holocron invocation
2. `HOLOCRON_INFISICAL_TOKEN` env var (preferred — explicit intent)
3. `INFISICAL_TOKEN` env var (Infisical-native, works in CI)
4. **Keyring** — `com.theholocron.cli` service, account `infisical`
5. `AuthError` naming all four options + the bootstrap hint

## Setup

```bash
# 1. Generate an Infisical token. Either token type works — see
#    https://infisical.com/docs for the current click path since
#    Infisical's dashboard reshuffles occasionally:
#      - Personal API Token — dashboard user profile → API tokens
#      - Universal Auth (machine identity, recommended for CI)
#        — organization access control → identities → create
# 2. Hand it off to holocron's keyring (one-shot):
holocron auth set infisical <TOKEN>
# 3. Verify (calls GET /v1/workspace and reports accessible workspaces):
holocron auth check infisical
```

**CI**: the keyring is not available in headless containers. Expose
the token as a GitHub Actions secret and set `HOLOCRON_INFISICAL_TOKEN`
(or `INFISICAL_TOKEN`) in the workflow env. Steps 1–3 of the auth
precedence still work; step 4 quietly falls through.

## Config

```jsonc
{
	"providers": {
		"vault": ["infisical", { "workspace": "<workspace-id>", "environment": "dev" }],
	},
}
```

- `workspace` (required) — Infisical workspace (project) id. Find via
  the workspace URL or the API. **Not the workspace slug** — Infisical's
  API rejects slug in this position ([Infisical#1894](https://github.com/Infisical/infisical/issues/1894)).
- `environment` (required) — Environment slug (usually `dev`, `stg`,
  or `prd`). `list()` reads secrets from this environment.

Individual `read` / `write` calls take a fully-qualified reference:

```
infisical://<workspaceId>/<environment>/<name>
```

The default `workspace` + `environment` in options apply to `list()`,
`environments()`, and `readEnvironment()` where a three-part reference
doesn't make sense.

## What's implemented

| Method              | Behavior                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `read`              | `GET /v3/secrets/raw/{name}?workspaceId&environment&secretPath=/`.                                                   |
| `write`             | `POST /v3/secrets/raw/{name}` (create); falls back to `PATCH` on "already exists" body for upsert semantics.         |
| `list`              | `GET /v3/secrets/raw` at the default `workspace + environment + secretPath=/`.                                       |
| `environments`      | `GET /v1/workspace/{workspaceId}`, returns each environment's `slug`.                                                |
| `readEnvironment`   | `GET /v3/secrets/raw?workspaceId&environment=<id>` — bulk KEY=VALUE dump for `holocron secrets sync`.                |
| `ensureProject`     | `POST /v2/workspace` with `{ projectName, slug }`. Treats 400/409/422 "already exists" as idempotent no-op.          |
| `ensureEnvironment` | `POST /v1/workspace/{project}/environments` with `{ environmentName, environmentSlug }`. Same idempotency semantics. |

Plugin-level exports (not capability methods, per the auth-bootstrap
convention):

| Export        | Purpose                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verifyToken` | `GET /v1/workspace` — returns `{ok: true, subject: "<n> workspaces · first: …"}` or `{ok: false, message}`. Works for both Personal Tokens and Universal Auth machine identities. |
| `AUTH_HINT`   | Points at Infisical's docs for token generation (rather than a specific click path — dashboard UI shifts).                                                                        |

## Self-hosted Infisical

Set the `baseUrl` option in `holocron.config.json`:

```jsonc
{
	"providers": {
		"vault": [
			"infisical",
			{
				"workspace": "<id>",
				"environment": "dev",
				"baseUrl": "https://infisical.internal.example.com/api",
			},
		],
	},
}
```

## Status

**`v2.0.0-alpha.1`** — scaffolded via `holocron plugin create` (see
`.notes/tool-plugin-create.spec.md` — this is the first real
production use of that command, doubling as its acceptance test in
a live scenario). Not yet published on npm; capability methods are
implemented but not yet validated against a live Infisical account.
APIs may still shift before stable v2.0.0.
