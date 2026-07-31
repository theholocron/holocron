---
title: Postman Plugin
description: Implements the tooling capability against Postman's REST API — workspace, collection, spec, and environment sync.
---

`@theholocron/holocron-plugin-postman` implements the `tooling` capability against [Postman](https://www.postman.com/)'s REST API. It syncs API definitions from the repo into Postman workspaces, keeping collections and environments up to date with the source of truth.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-postman
```

## Capabilities

| Capability | Token required |
| --- | --- |
| `tooling` | `HOLOCRON_POSTMAN_API_KEY` (`postman`) |

## Config

```ts
providers: {
  // Single Postman sync
  tooling: ["postman", {
    workspaceId: "abc123-...",
  }],

  // Or alongside other tooling providers (multi)
  tooling: [
    ["postman", { workspaceId: "abc123-..." }],
  ],
}
```

### Options

| Option | Required | Description |
| --- | --- | --- |
| `workspaceId` | Yes | Postman workspace id to sync into |

## Authentication

```bash
holocron auth set postman PMAK-xxx
```

Or via env var:
```bash
export HOLOCRON_POSTMAN_API_KEY=PMAK-xxx
```

Generate an API key in the Postman web app → Account Settings → API Keys.

## What `tooling` provides

- `sync()` — pulls the Postman workspace's authoritative state and reconciles it with the repo's API definitions (OpenAPI specs, collection files)
- `doctor()` — returns `{ ok, message }` indicating whether the Postman workspace is reachable and the API key is valid
