---
name: holocron-skill-client
title: "Holocron: New Client"
description: Scaffold a new @theholocron/<slug>-client package in the clients folder of theholocron/holocron. INVOKE WHEN: user asks to add a new HTTP client package to the clients group. Invoked as /holocron-skill-client.
---

<!-- editorconfig-checker-disable-file -->

# Scaffold a new client package

Scaffold a new `@theholocron/<slug>-client` package in `clients/` of `theholocron/holocron`.
The standalone `theholocron/clients` repo is archived; do not scaffold there.

Replace `<slug>` with the vendor name in kebab-case (e.g. `slack`, `stripe`),
`<Vendor>` with PascalCase (e.g. `Slack`, `Stripe`), and `<BASE_URL>` with
the API root (e.g. `https://api.stripe.com`).

Reference implementations: `clients/axiom-client` (smallest current example —
`createRestClient`, `stubFetch`, DI fetch, optional `logger` / `errors` sinks)
and `clients/http-client` (the shared primitives every client builds on).
Read `clients/axiom-client/package.json` and copy its shape rather than
trusting this template if they ever disagree.

---

## 1. Create the package directory

```
clients/<slug>-client/
├── src/
│   ├── index.ts
│   ├── index.test.ts
│   ├── utils.ts
│   └── <resource>/<resource>.ts
├── package.json
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
└── README.md
```

The workspace glob `clients/*` in `pnpm-workspace.yaml` already covers the new
folder, and knip's `clients/*` entry covers `src/index.ts` and `src/**/*.test.ts`,
so neither file needs editing. Tests live beside the module they cover
(`foo.test.ts`); there is no `__tests__` directory. There is no per-package
`LICENSE`, `CHANGELOG.md`, `eslint.config.ts` (the root config applies) or
`.releaserc`.

---

## 2. Config files

**`clients/<slug>-client/package.json`**

```json
{
  "name": "@theholocron/<slug>-client",
  "version": "<current clients version>",
  "description": "A TypeScript client for the <Vendor> API",
  "keywords": ["<slug>", "typescript", "http-client", "api"],
  "homepage": "https://docs.theholocron.dev/holocron/clients/<slug>/",
  "bugs": "https://github.com/theholocron/holocron/issues",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/theholocron/holocron.git",
    "directory": "clients/<slug>-client"
  },
  "license": "MIT",
  "author": "Newton Koumantzelis",
  "sideEffects": false,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs",
      "default": "./dist/index.mjs"
    }
  },
  "files": ["dist"],
  "scripts": {
    "delivery.build": "tsdown && node ../scripts/check-bundle-size.mjs",
    "sourceQuality.staticAnalysis": "eslint .",
    "test:watch": "vitest",
    "verification.typeSafety": "tsc --noEmit",
    "verification.unitTests": "vitest run"
  },
  "dependencies": {
    "@theholocron/http-client": "workspace:^",
    "@theholocron/observability": "catalog:"
  },
  "devDependencies": {
    "@theholocron/eslint-config": "catalog:configs",
    "@theholocron/tsconfig": "catalog:configs",
    "@theholocron/tsdown-config": "catalog:configs",
    "@theholocron/vitest-config": "catalog:configs",
    "@types/node": "catalog:",
    "@vitest/coverage-v8": "catalog:",
    "@vitest/eslint-plugin": "catalog:",
    "eslint": "catalog:",
    "eslint-plugin-n": "catalog:",
    "globals": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "engines": { "node": ">=22.0.0" },
  "publishConfig": { "access": "public" }
}
```

- **`version`**: read it from any sibling (`clients/http-client/package.json`);
  the whole `clients/` folder is one version group (tags `clients-vX.Y.Z`, one
  `clients/CHANGELOG.md`). `holocron package bump-versions --group clients`
  moves every package in the group together at release.
- **License is MIT** (ADR-0016). No `releases` or `wiki` fields.
- `homepage` uses the slug **without** `-client` (`.../clients/axiom/`),
  matching the docs page you add in step 5.
- Inside the group, `@theholocron/http-client` is `workspace:^`. Everything
  from `configs/` is `catalog:configs`; `@theholocron/*-utils` would be
  `catalog:utils`; third-party deps are `catalog:`. Never pin exact versions.
- Drop `@theholocron/observability` and the `logger` / `errors` options in
  step 3 only if you deliberately do not want diagnostics hooks.

**`tsdown.config.ts`** and **`vitest.config.ts`** are one line each:

```ts
export { default } from "@theholocron/tsdown-config/presets/library";
```

```ts
export { default } from "@theholocron/vitest-config/bundles/library";
```

**`tsconfig.json`**

```json
{
  "display": "<Vendor> API Client",
  "extends": "@theholocron/tsconfig/node-lts",
  "compilerOptions": { "baseUrl": "./", "outDir": "./dist" },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

## 3. Source files

### `src/utils.ts` — REST client factory

```ts
import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

export interface <Vendor>ClientOptions {
  /** <Vendor> API token. */
  token: string;
  /** Override base URL for testing. Defaults to <BASE_URL>. */
  baseUrl?: string;
  /** Override fetch for testing. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Structured logger for request/response diagnostics. Defaults to a no-op. */
  logger?: Logger;
  /** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
  errors?: ErrorSink;
}

export function create<Vendor>RestClient(opts: <Vendor>ClientOptions): RestClient {
  return createRestClient({
    baseUrl: opts.baseUrl ?? "<BASE_URL>",
    token: opts.token,
    vendor: "<Vendor>",
    fetch: opts.fetch,
    logger: opts.logger,
    errors: opts.errors,
  });
}
```

### `src/<resource>/<resource>.ts` — one file per API resource

Each takes the `RestClient` and returns its methods (see
`clients/axiom-client/src/datasets/datasets.ts`).

### `src/index.ts` — factory and public API

```ts
import { <resource> } from "./<resource>/<resource>.js";
import { type <Vendor>ClientOptions, create<Vendor>RestClient } from "./utils.js";

export type { <Vendor>ClientOptions } from "./utils.js";

export function create<Vendor>Client(opts: <Vendor>ClientOptions) {
  const rest = create<Vendor>RestClient(opts);
  return { <resource>: <resource>(rest) };
}

export type <Vendor>Client = ReturnType<typeof create<Vendor>Client>;
```

### `src/index.test.ts` — use `stubFetch`

```ts
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { create<Vendor>Client } from "./index.js";

describe("create<Vendor>Client", () => {
  it("sends Bearer authorization header", async () => {
    const { fetch, calls } = stubFetch([{ body: {} }]);
    const client = create<Vendor>Client({ token: "t", fetch });
    await client.<resource>.<method>();
    expect(calls[0]?.headers.authorization).toBe("Bearer t");
  });
});
```

Tests use `stubFetch` (dependency-injected fetch), never `vi.stubGlobal`.
Cover every public method and the error path.

### `README.md`

Same shape as `clients/axiom-client/README.md`: title, one-line description,
Installation (`pnpm add @theholocron/<slug>-client`), Usage, API tables, License.

## 4. Monorepo registration

1. **Install**: run `pnpm install` from the repo root. It links the new
   workspace package and updates `pnpm-lock.yaml`; commit the lockfile.
2. **Codecov**: `codecov.yml` has one component per package under the
   `# clients` heading (`component_id: <slug>-client`, `paths: clients/<slug>-client/**`).
   The file is generated by `holocron repo setup` (the "write codecov.yml" step,
   `codecovConfig()` in `cli/astromech/src/generators/codecov`), which needs
   tokens for its other steps, so in practice add the block by hand in exactly
   that format, keeping the list alphabetical.
3. **Release**: nothing to edit. `release.config.ts` and the `delivery.publish`
   task in `astromech.config.ts` release the whole `clients` group by folder.
4. **Dependency catalog**: only if something outside `clients/` (a plugin, the
   CLI) will consume the package, add it to `catalogs.clients` in
   `pnpm-workspace.yaml` after it has been published, and reference it as
   `catalog:clients`.

## 5. Docs

- Add `docs/src/content/docs/clients/<slug>.mdx` (frontmatter `title`,
  `description`; copy `axiom.mdx`).
- Add a row to the table in `docs/src/content/docs/clients/index.mdx`.
- Add `{ label: "<slug>-client", slug: "clients/<slug>" }` to the Clients
  group of the sidebar in the root `astro.config.ts` (alphabetical).

## 6. Non-negotiables

1. `version` matches the current `clients/` group version.
2. `repository.directory` is `clients/<slug>-client`; license `MIT`.
3. `@theholocron/http-client` is `workspace:^`, never a pinned version.
4. Tests use `stubFetch` beside the source; no `__tests__` directory.
5. Docs page, index row, sidebar entry and codecov component ship in the same PR.

## 7. Checklist before opening a PR

- [ ] Issue filed first; feature branch created from `origin/alpha` before any code
- [ ] `pnpm install` — workspace symlink created, lockfile updated
- [ ] `pnpm --filter @theholocron/<slug>-client verification.typeSafety` passes
- [ ] `pnpm --filter @theholocron/<slug>-client sourceQuality.staticAnalysis` passes
- [ ] `pnpm --filter @theholocron/<slug>-client verification.unitTests` passes
- [ ] `pnpm --filter @theholocron/<slug>-client delivery.build` — `dist/` emitted
- [ ] `version` in `package.json` matches the clients group
- [ ] `codecov.yml` component added
- [ ] Docs page, `clients/index.mdx` row and `astro.config.ts` sidebar entry added
- [ ] `holocron run ci` passes
- [ ] PR title is a Conventional Commit (`feat(clients): ...`); commits signed (`-s`)
- [ ] CI green before requesting review

After merge, the first publish of a brand-new package needs
`holocron package publish --initial --group clients` run by a maintainer
(npm Trusted Publishing needs the package to exist first); do not run it yourself.
