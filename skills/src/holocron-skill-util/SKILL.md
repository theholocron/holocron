---
name: holocron-skill-util
title: "Holocron: New Util"
description: Scaffold a new @theholocron/<slug>-utils package in theholocron/utils. INVOKE WHEN: user asks to add a new utility package to the utils monorepo. Invoked as /holocron-skill-util.
---

<!-- editorconfig-checker-disable-file -->

# Scaffold a new utility package

Scaffold a new `@theholocron/<name>-utils` package in `theholocron/utils`.

Replace `<name>` with the utility domain in kebab-case (e.g. `color`, `math`, `format`).

Reference implementations:
- Node-only package: `packages/string-utils` (canonical, no browser APIs)
- Browser-API package: `packages/location-utils` (adds DOM lib + eslint override)

---

## 1. Create the package directory

```
packages/<name>-utils/
├── src/
│   └── index.ts
├── package.json
├── tsdown.config.ts
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

Tests live colocated in `src/` as `*.test.ts` files alongside the source they cover.

---

## 2. File templates

### `package.json`

```json
{
  "name": "@theholocron/<name>-utils",
  "version": "<current monorepo version>",
  "description": "<One-line description.>",
  "homepage": "https://github.com/theholocron/utils/tree/main/packages/<name>-utils#readme",
  "bugs": "https://github.com/theholocron/utils/issues",
  "releases": "https://github.com/theholocron/utils/releases",
  "wiki": "https://github.com/theholocron/utils/wiki",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/theholocron/utils.git"
  },
  "license": "GPL-3.0",
  "author": "Newton Koumantzelis",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsdown",
    "lint": "eslint .",
    "test": "vitest run",
    "typecheck": "npx tsc --noEmit"
  },
  "devDependencies": {
    "@theholocron/tsdown-config": "catalog:configs",
    "@theholocron/vitest-config": "catalog:configs",
    "@tsconfig/node-lts": "catalog:",
    "@vitest/coverage-v8": "catalog:",
    "tsdown": "catalog:",
    "vitest": "catalog:"
  },
  "packageManager": "pnpm@10.34.4",
  "engines": {
    "node": ">=22",
    "pnpm": ">=10"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

- **Match `version` to the current monorepo version** — check any existing package's `package.json`.
- Runtime dependencies (if any) go in `"dependencies"`, not `devDependencies`.
- Browser-API packages should add `"happy-dom": "catalog:"` to `devDependencies` for tests.

### `tsdown.config.ts`

```ts
import { library } from "@theholocron/tsdown-config/presets/library";
import type { UserConfig } from "tsdown";

const config: UserConfig = library({
	deps: { neverBundle: [/^@theholocron\//] },
});

export default config;
```

If the package has runtime dependencies that should also be externalized, add their patterns to `neverBundle` (e.g. `packages/string-utils` externalizes `change-case` and `title-case`).

### `tsconfig.json` (Node-only)

```json
{
  "display": "<Name> Utilities",
  "extends": "@tsconfig/node-lts/tsconfig.json",
  "compilerOptions": {
    "allowImportingTsExtensions": true
  },
  "include": ["./src/**/*.ts"],
  "exclude": ["./node_modules", "**/*.test.ts"]
}
```

### `tsconfig.json` (Browser-API package)

Add `"lib"` to `compilerOptions`:

```json
{
  "display": "<Name> Utilities",
  "extends": "@tsconfig/node-lts/tsconfig.json",
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "lib": ["dom", "dom.iterable", "es2022"]
  },
  "include": ["./src/**/*.ts"],
  "exclude": ["./node_modules", "**/*.test.ts"]
}
```

### `vitest.config.ts`

```ts
import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

export default defineConfig(library({ globals: true }) as never);
```

`globals: true` is required — tests use `describe`/`test`/`expect` without explicit imports.

### `src/index.ts`

```ts
// Named exports — no default export
export function myUtil(value: string): string {
	return value;
}
```

Use named exports throughout. Group related utilities into sibling files (`src/casing.ts`, `src/casting.ts`, …) and re-export from `src/index.ts`:

```ts
export * from "./casing.ts";
export * from "./casting.ts";
```

Note: source imports use `.ts` extensions — TypeScript's ESM convention.

### Test files (`src/<module>.test.ts`)

```ts
import { describe, expect, test } from "vitest";

import { myUtil } from "./index.ts";

describe("<Name>", () => {
	test("does X", () => {
		expect(myUtil("input")).toBe("expected");
	});
});
```

### `README.md`

```markdown
# `@theholocron/<name>-utils`

<One-line description of what the utilities do.>

## Installation

\`\`\`bash
pnpm add @theholocron/<name>-utils
\`\`\`

## Usage

\`\`\`typescript
import * as <name> from "@theholocron/<name>-utils";

<minimal working example>
\`\`\`

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
```

---

## 3. Register in `release.config.ts`

Add the new package path to `prepareCmd` **in alphabetical order**:

```ts
// release.config.ts
"node -e \"...['packages/array-utils','packages/<name>-utils',...].forEach(...)\"",
```

---

## 4. Add to `codecov.yml`

Append to `component_management.individual_components` (keep alphabetical):

```yaml
- component_id: <name>-utils
  name: "<name>-utils"
  paths:
    - packages/<name>-utils/**
```

---

## 5. Browser-API packages only: update root `eslint.config.ts`

Add the new package's source path to the browser override block:

```ts
// eslint.config.ts — existing override
files: [
  "packages/location-utils/src/**",
  "packages/misc-utils/src/**",
  "packages/storage-utils/src/**",
  "packages/<name>-utils/src/**",   // ← add here
],
rules: {
  "n/no-unsupported-features/node-builtins": "off",
},
```

---

## Non-negotiables

- **`catalog:configs`** for `@theholocron/tsdown-config` and `@theholocron/vitest-config`; `catalog:` for everything else — never pin exact versions.
- **`tsdown` and `vitest` must be direct `devDependencies`** — pnpm does not expose transitive binaries.
- **`globals: true`** in every `vitest.config.ts` — required by existing test style.
- **Match version to current monorepo version** before opening a PR.
- **Run `pnpm install`** after adding `package.json` to pick up workspace resolution.

---

## Checklist

1. Create `packages/<name>-utils/` with all files listed above.
2. Add package path to `prepareCmd` in `release.config.ts` (alphabetical order).
3. Add `component_id` entry to `codecov.yml` (alphabetical order).
4. If browser-API package: add `"lib"` to tsconfig + add path to root `eslint.config.ts` override.
5. Run `pnpm install` — must resolve without errors.
6. Run `pnpm build` — tsdown must compile successfully.
7. Run `pnpm test` — all tests must pass.
8. Run `pnpm typecheck` — no type errors.
9. Run `pnpm lint` — no lint errors.
10. Open a PR with a `feat:` commit — semantic-release computes a minor bump and publishes all packages in lockstep.
