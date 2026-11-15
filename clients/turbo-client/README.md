# `@theholocron/turbo-client`

TypeScript client for [Turborepo's Remote Cache](https://turborepo.com/docs/core-concepts/remote-caching), which Vercel
serves. The token is a Vercel token (what Turborepo reads as `TURBO_TOKEN`).

## Install

```bash
pnpm add @theholocron/turbo-client
```

## Usage

```ts
import { createTurboClient } from "@theholocron/turbo-client";

const turbo = createTurboClient({ token: process.env.TURBO_TOKEN! });

// Is Remote Caching on for the team (`TURBO_TEAM`, a slug; a `team_...` id also works)?
const { status, readOnly } = await turbo.cache.status("acme");
// status: "enabled" | "disabled" | "over_limit" | "paused"; readOnly: the token can read but not upload
```
