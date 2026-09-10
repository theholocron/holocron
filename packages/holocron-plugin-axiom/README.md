<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-axiom`

Axiom plugin for [Holocron](../cli). Implements the `logs` capability
against [Axiom's REST API](https://axiom.co/docs/restapi/introduction),
plus exports `verifyToken` + `AUTH_HINT` for use by `holocron auth`.

> This plugin does **not** ship log lines. `@theholocron/observability/logger`'s
> Axiom transport reads `HOLOCRON_AXIOM_TOKEN` / `HOLOCRON_AXIOM_DATASET`
> directly at startup. The `logs` capability exists only for the
> management surface — `holocron setup` provisions the aggregation
> datasets and `holocron doctor` checks connectivity.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-axiom
```

## Auth

Token resolution order:

1. `--token <TOKEN>` flag on the holocron invocation
2. `HOLOCRON_AXIOM_TOKEN` env var (preferred — explicit intent)
3. `AXIOM_TOKEN` env var (Axiom-native, works in CI)
4. Keyring `axiom.<org>` — tried first when an org is active via `--org`, `HOLOCRON_ORG`, or `org` in `holocron.config.ts`
5. Keyring `axiom` — unnamespaced fallback; set via `holocron auth set axiom <token>`
6. `AuthError` naming both env vars + the auth hint

Generate an API token at **app.axiom.co/settings/api-tokens** with
permission to read and create datasets.

```bash
holocron auth set axiom.theholocron <TOKEN>
```

**CI**: the keyring is unavailable in headless containers — expose the
token as `HOLOCRON_AXIOM_TOKEN` (or `AXIOM_TOKEN`) in the workflow env.

## Config

```jsonc
{
  "providers": {
    "logs": "axiom",
  },
}
```

No options are required. `holocron setup` provisions the `holocron-ci`
and `holocron-local` datasets; `holocron doctor` checks the dataset
named by `HOLOCRON_AXIOM_DATASET` / `AXIOM_DATASET`. An explicit
`logs: ["axiom", { "dataset": "holocron-ci" }]` overrides the env var
for `doctor`.

`HOLOCRON_AXIOM_DATASET` is **not a secret** — set it in your shell
profile locally (`holocron-local`) or as an org CI secret
(`holocron-ci`). Leave it unset locally to skip Axiom entirely.

## What's implemented

| Method          | Behavior                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `describe`      | Returns `{ provider: "axiom", envKeys: ["HOLOCRON_AXIOM_TOKEN", "HOLOCRON_AXIOM_DATASET"] }`.    |
| `whoami`        | `GET /v2/datasets/{dataset}` — verifies the token and the configured dataset's reachability.     |
| `ensureDataset` | `GET /v2/datasets/{name}`; on 404, `POST /v2/datasets`. Returns `{ alreadyExists }`. Idempotent. |

Plugin-level exports (not capability methods, per the auth-bootstrap convention):

| Export        | Purpose                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `verifyToken` | `GET /v2/user` — returns `{ ok: true, subject: "user @ …" }` or `{ ok: false, message }`.   |
| `AUTH_HINT`   | One-line hint printed by `holocron auth set` when no token is supplied or the token is bad. |
