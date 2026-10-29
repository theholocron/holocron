---
name: holocron-skill-util
title: "Holocron: New Util"
description: Scaffold a new @theholocron/<slug>-utils package in the utils folder of theholocron/holocron. INVOKE WHEN: user asks to add a new utility package to the utils group. Invoked as /holocron-skill-util.
---

<!-- editorconfig-checker-disable-file -->

# Scaffold a new utility package

Scaffold a new `@theholocron/<name>-utils` package in `utils/` of `theholocron/holocron`.
The standalone `theholocron/utils` repo is archived; do not scaffold there.

Replace `<name>` with the utility domain in kebab-case (e.g. `color`, `math`, `format`).

Reference implementations (read their `package.json` and copy the shape if this
template ever disagrees):

- Node-only package: `utils/array-utils` (smallest) or `utils/string-utils` (has runtime deps)
- Browser-API package: `utils/location-utils` (DOM lib, happy-dom, eslint override)

---

## 1. Create the package directory

```
utils/<name>-utils/
├── src/
│   ├── index.ts
│   ├── <module>.ts
│   └── <module>.test.ts
├── package.json
├── tsdown.config.ts
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

Tests live beside the module they cover (`<module>.test.ts` in `src/`); there is
no `__tests__` directory. There is no per-package `LICENSE`, `CHANGELOG.md`,
`eslint.config.ts` (the root config applies) or `.releaserc`. The workspace glob
`utils/*` in `pnpm-workspace.yaml` already covers the new folder, and knip's
`utils/*` entry covers `src/index.ts` and `src/**/*.test.ts`.

---

## 2. File templates

### `package.json`

```json
{
  "name": "@theholocron/<name>-utils",
  "version": "<current utils version>",
  "description": "<One-line description.>",
  "keywords": ["<name>", "typescript", "utils"],
  "homepage": "https://docs.theholocron.dev/holocron/utils/<name>-utils/",
  "bugs": "https://github.com/theholocron/holocron/issues",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/theholocron/holocron.git",
    "directory": "utils/<name>-utils"
  },
  "license": "MIT",
  "author": "Newton Koumantzelis",
  "sideEffects": false,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "delivery.build": "tsdown",
    "sourceQuality.staticAnalysis": "eslint .",
    "test:watch": "vitest",
    "verification.typeSafety": "tsc --noEmit",
    "verification.unitTests": "vitest run"
  },
  "devDependencies": {
    "@theholocron/eslint-config": "catalog:configs",
    "@theholocron/tsdown-config": "catalog:configs",
    "@theholocron/vitest-config": "catalog:configs",
    "@tsconfig/node-lts": "catalog:",
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
  "engines": { "node": ">=22" },
  "publishConfig": { "access": "public" }
}
```

- **`version`**: read it from any sibling (`utils/array-utils/package.json`). The
  `utils/` folder is one version group (tags `utils-vX.Y.Z`, one
  `utils/CHANGELOG.md`); `holocron package bump-versions --group utils` moves
  every package together at release.
- **License is MIT** (ADR-0016). No `releases`, `wiki` or `packageManager` fields.
- `homepage` keeps the full package name (`.../utils/<name>-utils/`).
- Runtime dependencies (if any) go in `"dependencies"` (`catalog:` for
  third-party, `workspace:^` for another `utils/` package), not `devDependencies`.
- Browser-API packages add `"happy-dom": "catalog:"` to `devDependencies`.

### `tsdown.config.ts`

One line, re-exporting the shared preset:

```ts
export { default } from "@theholocron/tsdown-config/presets/library";
```

If the package has runtime dependencies that must stay external, use the preset
as a function instead (see `utils/string-utils/tsdown.config.ts`):

```ts
import { library } from "@theholocron/tsdown-config/presets/library";
import type { UserConfig } from "tsdown";

const config: UserConfig = library({
  deps: { neverBundle: [/^@theholocron\//, /^some-dependency$/] },
});

export default config;
```

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

Browser-API packages pass `environment: "happy-dom"` too
(`library({ globals: true, environment: "happy-dom" })`).

### `src/index.ts`

```ts
// Named exports — no default export
export function myUtil(value: string): string {
  return value;
}
```

Use named exports throughout. Group related utilities into sibling files
(`src/casing.ts`, `src/casting.ts`, …) and re-export from `src/index.ts`:

```ts
export * from "./casing.ts";
export * from "./casting.ts";
```

Source imports use `.ts` extensions (`allowImportingTsExtensions`).

### Test files (`src/<module>.test.ts`)

```ts
import { describe, expect, test } from "vitest";

import * as util from "./index.ts";

describe("<Name>", () => {
  test("does X", () => {
    expect(util.myUtil("input")).toBe("expected");
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
import { myUtil } from "@theholocron/<name>-utils";

<minimal working example>
\`\`\`
```

---

## 3. Monorepo registration

1. Run `pnpm install` from the repo root (links the workspace package, updates
   `pnpm-lock.yaml`; commit the lockfile).
2. **Codecov**: add a component under the `# utils` heading of `codecov.yml`
   (`component_id: <name>-utils`, `paths: utils/<name>-utils/**`), alphabetical.
   The file is generated by `holocron repo setup` ("write codecov.yml" step,
   `cli/astromech/src/generators/codecov`); that command needs tokens for its
   other steps, so add the block by hand in exactly that format.
3. **Release**: nothing to edit. `release.config.ts` and the `delivery.publish`
   task in `astromech.config.ts` release the whole `utils` group by folder.
4. **Browser-API packages only**: add `"utils/<name>-utils/src/**"` to the
   browser override (`files: [...]`, turning off
   `n/no-unsupported-features/node-builtins`) in the root `eslint.config.ts`.
5. **Dependency catalog**: if something outside `utils/` (the CLI, a plugin, a
   client) will consume it, add it to `catalogs.utils` in `pnpm-workspace.yaml`
   once it has been published and reference it as `catalog:utils`.
6. **Docs**: add `docs/src/content/docs/utils/<name>-utils.mdx` (frontmatter
   `title`, `description`; copy `array-utils.mdx`), a row in
   `docs/src/content/docs/utils/index.mdx`, and
   `{ label: "<name>-utils", slug: "utils/<name>-utils" }` to the Utils group of
   the sidebar in the root `astro.config.ts` (alphabetical).

---

## Non-negotiables

- **`catalog:configs`** for `@theholocron/tsdown-config`, `@theholocron/vitest-config`,
  `@theholocron/eslint-config`; `catalog:` for everything else — never pin exact versions.
- **`tsdown` and `vitest` must be direct `devDependencies`** — pnpm does not expose transitive binaries.
- **`globals: true`** in every `vitest.config.ts` — tests use `describe`/`test`/`expect`.
- **Match `version` to the utils group** before opening a PR.
- Tests beside the source; no `__tests__` directory.

---

## Checklist

1. Create `utils/<name>-utils/` with all files listed above.
2. `pnpm install` — must resolve without errors; lockfile committed.
3. `pnpm --filter @theholocron/<name>-utils` run `delivery.build`,
   `verification.unitTests`, `verification.typeSafety` and
   `sourceQuality.staticAnalysis` — all must pass.
4. Add the `codecov.yml` component (alphabetical).
5. Browser-API package: `"lib"` in tsconfig, happy-dom, and the root
   `eslint.config.ts` override path.
6. Add the docs page, `utils/index.mdx` row and sidebar entry.
7. `holocron run ci` passes.
8. Open a PR with a `feat(utils):` commit, signed with `-s` — semantic-release
   computes the next `utils-v*` version and publishes the group in lockstep.
   The first publish of a brand-new package needs
   `holocron package publish --initial --group utils` run by a maintainer.
