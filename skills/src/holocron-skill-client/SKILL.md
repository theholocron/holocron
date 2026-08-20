---
name: holocron-skill-client
title: "Holocron: New Client"
description: Scaffold a new @theholocron/<slug>-client package in theholocron/clients. INVOKE WHEN: user asks to add a new HTTP client package to the clients monorepo. Invoked as /holocron-skill-client.
---

<!-- editorconfig-checker-disable-file -->

# Scaffold a new client package

Replace `<slug>` with the vendor name in kebab-case (e.g. `slack`, `stripe`),
`<Vendor>` with PascalCase (e.g. `Slack`, `Stripe`), and `<BASE_URL>` with
the API root (e.g. `https://api.stripe.com`).

Reference implementation: `packages/zendesk-client` (the canonical example
of the current patterns — `createRestClient`, `stubFetch`, DI fetch).

---

## 1. Register in the workspace

Add to `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/<slug>-client
```

Then run `pnpm install` from the repo root.

---

## 2. Config files (identical across all clients)

**`packages/<slug>-client/package.json`**

```json
{
  "name": "@theholocron/<slug>-client",
  "version": "0.0.0",
  "description": "A TypeScript client for the <Vendor> API",
  "homepage": "https://github.com/theholocron/clients/tree/main/packages/<slug>-client#readme",
  "bugs": "https://github.com/theholocron/clients/issues",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/theholocron/clients.git",
    "directory": "packages/<slug>-client"
  },
  "license": "GPL-3.0",
  "author": "Newton Koumantzelis",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsdown",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@theholocron/http-client": "<current-lockstep-version>"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@theholocron/eslint-config": "catalog:",
    "@theholocron/tsconfig": "catalog:",
    "@theholocron/tsdown-config": "catalog:",
    "@theholocron/vitest-config": "catalog:",
    "@vitest/coverage-v8": "catalog:",
    "@vitest/eslint-plugin": "catalog:",
    "eslint": "catalog:",
    "eslint-plugin-n": "catalog:",
    "globals": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "publishConfig": {
    "access": "public",
    "main": "./dist/index.mjs",
    "types": "./dist/index.d.mts",
    "exports": {
      ".": {
        "types": "./dist/index.d.mts",
        "import": "./dist/index.mjs",
        "default": "./dist/index.mjs"
      }
    }
  },
  "files": ["dist", "README.md"],
  "engines": { "node": ">=22.0.0" },
  "releases": "https://github.com/theholocron/clients/releases"
}
```

## 3. Source files

### `src/client.ts` — REST client factory

```ts
import { createRestClient, type RestClient } from "@theholocron/http-client";

export interface <Vendor>ClientOptions {
  token: string;
  fetch?: typeof fetch;
}

export function create<Vendor>RestClient(opts: <Vendor>ClientOptions): RestClient {
  return createRestClient({
    baseUrl: "<BASE_URL>",
    token: opts.token,
    vendor: "<Vendor>",
    fetch: opts.fetch,
  });
}
```

### `src/index.ts` — factory + public API

```ts
import { create<Vendor>RestClient } from "./client.js";
import { <resources> } from "./<resources>.js";

export type { <Vendor>ClientOptions } from "./client.js";
export type * from "./types.js";

export function create<Vendor>Client(opts: <Vendor>ClientOptions) {
  const rest = create<Vendor>RestClient(opts);
  return { <resources>: <resources>(rest) };
}
```

## 4. Non-negotiables

1. **Add to `.releaserc.json` `prepareCmd`** — alphabetical order. Omitting this leaves
   the package frozen at its initial version while all others advance.
2. **Set initial `version`** in `package.json` to match the current lockstep version.
3. **Add entry to `codecov.yml`** under `component_management.individual_components`.
4. **Use `stubFetch`** in tests — DI pattern, no `vi.stubGlobal`.

## 5. Checklist before opening a PR

- [ ] `pnpm install` — workspace symlink created
- [ ] `pnpm --filter @theholocron/<slug>-client typecheck` passes
- [ ] `pnpm --filter @theholocron/<slug>-client lint` passes
- [ ] `pnpm --filter @theholocron/<slug>-client test` passes
- [ ] `pnpm --filter @theholocron/<slug>-client build` — `dist/` emitted
- [ ] `packages/<slug>-client` added to `prepareCmd` in `.releaserc.json`
- [ ] `version` in `package.json` set to current lockstep version
- [ ] `codecov.yml` entry added
