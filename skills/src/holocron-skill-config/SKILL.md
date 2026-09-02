---
name: holocron-skill-config
title: "Holocron: New Config"
description: Scaffold a new shareable config package in theholocron/configs. INVOKE WHEN: user asks to add a new @theholocron/<tool>-config package to the configs monorepo. Invoked as /holocron-skill-config.
---

<!-- editorconfig-checker-disable-file -->

# Scaffold a new config package

Scaffold a new shareable config package in `theholocron/configs`.

## When to use

When the user asks to add a new `@theholocron/<tool>-config` package to this monorepo.

## What to produce

Seven files in `packages/<tool>-config/`:

```
packages/<tool>-config/
├── package.json
├── index.ts           (or named-export entry; use presets/ for multi-preset)
├── tsdown.config.ts
├── tsconfig.json
├── vitest.config.ts
├── index.test.ts
└── README.md
```

Optionally, if the config needs multiple presets:

```
packages/<tool>-config/
├── package.json
├── index.ts           (re-exports all named presets)
├── presets/
│   ├── node.ts
│   └── react.ts
├── bundles/           (preset + opinionated settings combined)
│   └── library.ts
├── tsdown.config.ts
├── tsconfig.json
├── vitest.config.ts
├── index.test.ts
└── README.md
```

## File templates

### `package.json`

Copy the shape from an existing package (e.g. `packages/prettier-config/package.json`).
Key fields:

```json
{
  "name": "@theholocron/<tool>-config",
  "version": "<current monorepo version>",
  "description": "A <Tool> configuration for <purpose>.",
  "homepage": "https://github.com/theholocron/configs/tree/main/packages/<tool>-config#readme",
  "bugs": "https://github.com/theholocron/configs/issues",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/theholocron/configs.git"
  },
  "license": "GPL-3.0",
  "author": "Newton Koumantzelis",
  "keywords": ["<tool>", "config", "theholocron"],
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@theholocron/tsconfig": "workspace:*",
    "@theholocron/vitest-config": "workspace:*",
    "@vitest/coverage-v8": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist/"],
  "peerDependencies": {
    "<tool>": "^<major>"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "publishConfig": { "access": "public" }
}
```

- **Match `version` to the current monorepo version** — check the root `package.json`.
- All peer deps that are optional per-preset go under `peerDependenciesMeta`:
  ```json
  "peerDependenciesMeta": { "<tool>": { "optional": true } }
  ```
- Export each preset/bundle as a subpath (`"./presets/node"`, `"./bundles/library"`, …),
  add the corresponding `"types"` / `"import"` / `"default"` keys pointing to `dist/`,
  and ensure they are listed under `"files": ["dist/"]`.

### `tsdown.config.ts`

```ts
import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["index.ts"],
  format: "esm",
  fixedExtension: false,
  dts: true,
  clean: true,
});
```

For multi-preset packages list every entry point:

```ts
entry: ["index.ts", "presets/node.ts", "presets/react.ts", "bundles/library.ts"],
```

### `tsconfig.json`

```json
{
  "extends": "@theholocron/tsconfig/node-lts",
  "compilerOptions": { "rootDir": ".", "outDir": "dist" },
  "include": ["**/*.ts"],
  "exclude": ["dist", "node_modules", "tsdown.config.ts"]
}
```

### `vitest.config.ts`

```ts
import { node } from "@theholocron/vitest-config";
import { defineConfig } from "vitest/config";
export default defineConfig(node());
```

### `index.ts` (single default export)

```ts
import type { Config } from "<tool>";

const config = {
  // ...
} satisfies Config;

export default config;
```

### `index.ts` (named presets / multi-export)

```ts
export { node } from "./presets/node.js";
export { react } from "./presets/react.js";
```

Note: source files use `.js` extensions on relative imports — TypeScript's ESM
convention; the TS resolver finds the `.ts` file at build time.

### `index.test.ts`

```ts
import { describe, it, expect } from "vitest";
import config from "./index.js";

describe("<tool>-config", () => {
  it("exports a non-empty config object", () => {
    expect(typeof config).toBe("object");
    expect(Object.keys(config).length).toBeGreaterThan(0);
  });
});
```

### `README.md`

Follow this structure (see existing READMEs for tone):

```markdown
# <Tool> Config

A [<Tool> configuration](official-docs-url) for <one-line description>.

## Installation

\`\`\`bash
npm install --save-dev @theholocron/<tool>-config
\`\`\`

## Usage

<minimal working example — show the exact file name the user creates and its contents>

## <Optional: named presets or bundles section>
```

Keep it short. Link to official docs rather than duplicating them.

## Non-negotiables

- **TypeScript source, compiled to `dist/` via tsdown.** Never publish raw `.ts`
  files or add plain `.js` source. The `"files"` field must be `["dist/"]`.
- **Match version to current monorepo version** — check root `package.json`.
- **Peer deps, not regular deps.** The tool being configured belongs in
  `peerDependencies`.
- **Deprecation notice** if replacing an existing package — add a banner at the
  top of the old package's `README.md` pointing to the replacement.
- Run `pnpm install` after adding the package to pick up workspace resolution.
- Run `pnpm build` to verify tsdown compiles successfully.
- Run `pnpm lint` to verify the new files pass ESLint.

## Checklist

1. Create `packages/<tool>-config/` with all seven files listed above.
2. Set `devDependencies` to include `@theholocron/tsconfig`, `@theholocron/vitest-config`,
   `@vitest/coverage-v8`, `tsdown`, `typescript`, and `vitest` (use `catalog:` /
   `workspace:*` specifiers — never pin exact versions).
3. Confirm `scripts` has `"build": "tsdown"`, `"test": "vitest run"`, and
   `"typecheck": "tsc --noEmit"`.
4. Add entry to `codecov.yml` under `component_management.individual_components`
   with `component_id: <slug>`, `name: "<slug>"`, and `paths: [packages/<slug>/**]`.
5. Run `pnpm install`, `pnpm build`, `pnpm test`, `pnpm typecheck` — all must pass.
6. Open a PR with a `feat:` commit — semantic-release will compute a minor bump
   and publish all packages in lockstep.
