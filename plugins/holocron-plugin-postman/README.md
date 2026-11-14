<!-- alex disable postman-postwoman -->

# `@theholocron/holocron-plugin-postman`

Postman plugin for [Holocron](../cli). Implements the **multi-cardinality**
`tooling` capability against [Postman's REST API](https://learning.postman.com/docs/developer/postman-api/).

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-postman@alpha

```

## Why REST, not the CLI

Postman ships a CLI (`postman`, the newer + more capable successor to
`newman`), but for our `tooling` surface — collection / spec / environment
**management** — REST is the canonical interface and avoids a system-binary
dependency. The CLI is best suited for running collections (the newman use
case); we sync, we don't run.

## Auth

Token resolution order:

1. `--token <KEY>` flag on the holocron invocation
2. `HOLOCRON_POSTMAN_TOKEN` env var
3. `POSTMAN_API_KEY` env var (Postman's own standard)
4. Keyring `postman.<org>` — tried first when an org is active via `--org`, `HOLOCRON_ORG`, or `org` in `holocron.config.ts`
5. Keyring `postman` — unnamespaced fallback; set via `holocron new token postman <key>`

Generate the key at <https://web.postman.co/settings/me/api-keys>.

## Config

<!-- prettier-ignore -->
```jsonc
{
  "providers": {
    "tooling": [
      [
        "postman",
        {
          "workspaceId": "00000000-0000-0000-0000-000000000000",
          "specFile": "apps/api/openapi.json",
          "specName": "Rando API",
          "collectionName": "Rando API",
          "envFiles": ["apps/api/postman-env-staging.json"],
        },
      ],
      "storybook",
    ],
  },
}

```

- `workspace` / `workspaceId` (one is required) — the workspace by name (`sync` finds it, or makes it) or by id (wins over the name). Find an id via `holocron tooling postman workspaces`.
- `workspaceType` (optional) — `personal` (default) or `team`: the type of a workspace `sync` makes.
- `collectionFiles` (optional) — hand-written Postman collection JSON files. Each is matched to a collection in the workspace by `info.name` and replaced in place, or created.
- `specFile` (optional) — relative path to the local OpenAPI JSON. `sync` reads + uploads this.
- `specName` (optional) — display name in Postman's Spec Hub. Defaults to repo name.
- `collectionName` (optional) — name for the imported collection. Defaults to `specName`.
- `envFiles` (optional) — local Postman environment JSON files to push. A secret the file leaves empty keeps the value the environment already holds.

`sync` needs at least one of `specFile`, `collectionFiles` and `envFiles`.

## What's implemented

| Method                                                                             | What it does                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tooling interface**                                                              |                                                                                                                                                                                                                 |
| `sync()`                                                                           | Finds or makes the workspace; with `specFile`, upserts the Spec Hub spec and delete-then-imports the collection; replaces or creates each `collectionFiles` collection; find-or-creates each env in `envFiles`. |
| `doctor()`                                                                         | Probes `/me` + `/workspaces`; returns `{ ok, message }`.                                                                                                                                                        |
| **Postman-specific methods** (on `PostmanTooling`, not on the `Tooling` interface) |                                                                                                                                                                                                                 |
| `getMyself`                                                                        | `GET /me` — authed user identity.                                                                                                                                                                               |
| `listWorkspaces`                                                                   | `GET /workspaces`.                                                                                                                                                                                              |
| `findCollectionByName`                                                             | `GET /collections?workspace=…` + name filter.                                                                                                                                                                   |
| `deleteCollection`                                                                 | `DELETE /collections/{uid}`.                                                                                                                                                                                    |
| `importOpenApi`                                                                    | `POST /import/openapi?workspace=…` with the spec stringified into `{ type: "string", input }`.                                                                                                                  |
| `findEnvironmentByName`                                                            | `GET /environments?workspace=…` + name filter.                                                                                                                                                                  |
| `createEnvironment`                                                                | `POST /environments?workspace=…`.                                                                                                                                                                               |
| `updateEnvironment`                                                                | `PUT /environments/{uid}`.                                                                                                                                                                                      |
| `findSpecByName`                                                                   | `GET /specs?workspaceId=…` + name filter.                                                                                                                                                                       |
| `createSpec`                                                                       | `POST /specs?workspaceId=…` (flat body — name/type are NOT wrapped under `spec`).                                                                                                                               |
| `upsertSpecFile`                                                                   | `PATCH /specs/{id}/files/{path}` (PUT returns 404 here).                                                                                                                                                        |

## Status

**`v2.0.0-alpha.0`** — published on npm under the `alpha` dist-tag.
[Release notes](https://github.com/theholocron/holocron/releases/tag/v2.0.0-alpha.0).
APIs may still shift before stable v2.0.0.

`PostmanPlanLimitError` is thrown when Postman responds with
`limitReachedError` (e.g., Free-tier "0 APIs" cap) — callers can
discriminate to render "upgrade required" instead of a raw API dump.
