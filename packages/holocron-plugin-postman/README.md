# `@theholocron/holocron-plugin-postman`

Postman plugin for [Holocron](../cli). Implements the **multi-cardinality**
`tooling` capability against [Postman's REST API](https://learning.postman.com/docs/developer/postman-api/).

## Why REST, not the CLI

Postman ships a CLI (`postman`, the newer + more capable successor to
`newman`), but for our `tooling` surface — collection / spec / environment
**management** — REST is the canonical interface and avoids a system-binary
dependency. The CLI is best suited for running collections (the newman use
case); we sync, we don't run.

## Auth

Token resolution order:

1. `--token <KEY>` flag on the holocron invocation
2. `HOLOCRON_POSTMAN_API_KEY` env var
3. `POSTMAN_API_KEY` env var (Postman's own standard)

Generate the key at https://web.postman.co/settings/me/api-keys.

## Config

```jsonc
{
  "providers": {
    "tooling": [
      ["postman", {
        "workspaceId": "00000000-0000-0000-0000-000000000000",
        "specFile": "apps/api/openapi.json",
        "specName": "Rando API",
        "collectionName": "Rando API",
        "envFiles": ["apps/api/postman-env-staging.json"]
      }],
      "storybook"
    ]
  }
}
```

- `workspaceId` (required) — Postman workspace id. Find via `holocron tooling postman workspaces`.
- `specFile` (optional) — relative path to the local OpenAPI JSON. `sync` reads + uploads this.
- `specName` (optional) — display name in Postman's Spec Hub. Defaults to repo name.
- `collectionName` (optional) — name for the imported collection. Defaults to `specName`.
- `envFiles` (optional) — local Postman environment JSON files to push.

## Status

**v0.0.0 — scaffold only.** `sync()` and `doctor()` are stubbed
(`throw new Error('not implemented')`); real implementations land in
the next commit, ported from rando-id/rando.id's
`adapters/postman.ts`.

The `Tooling` capability surface stays minimal (`sync` + `doctor`) —
Postman-specific operations (workspaces, collections, environments,
spec hub) become class methods on `PostmanTooling`, not on the
shared `Tooling` interface (those are too Postman-shaped to belong
on a generic tooling contract).
