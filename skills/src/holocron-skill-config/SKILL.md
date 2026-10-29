---
name: holocron-skill-config
title: "Holocron: New Config"
description: Scaffold a new shareable config package in the configs folder of theholocron/holocron. INVOKE WHEN: user asks to add a new @theholocron/<tool>-config package to the configs group. Invoked as /holocron-skill-config.
---

<!-- editorconfig-checker-disable-file -->

# Scaffold a new config package

Scaffold a new shareable config package in `configs/` of `theholocron/holocron`.
The standalone `theholocron/configs` repo is archived; do not scaffold there.

## When to use

When the user asks to add a new `@theholocron/<tool>-config` package.

Reference implementations: `configs/prettier-config` (single default export),
`configs/commitlint-config` (same, with peers), and `configs/vitest-config` /
`configs/tsdown-config` (multi-preset, with `presets/` and `bundles/`). Read
the sibling's `package.json` and copy its shape if this template ever disagrees.

## What to produce

Unlike clients and utils, a config package keeps its sources at the package
root (no `src/`), and its test sits beside `index.ts`:

```
configs/<tool>-config/
├── package.json
├── index.ts           (or named-export entry; use presets/ for multi-preset)
├── index.test.ts
├── tsdown.config.ts
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

Multi-preset packages add `presets/*.ts` (and optionally `bundles/*.ts`, a
preset plus opinionated settings) and re-export them from `index.ts`.

There is no per-package `LICENSE` or `.releaserc`, and you do not create a
`CHANGELOG.md`: the whole `configs/` folder is one version group with a single
`configs/CHANGELOG.md`. The workspace glob `configs/*` in `pnpm-workspace.yaml`
already covers the new folder.

## File templates

### `package.json`

```json
{
  "name": "@theholocron/<tool>-config",
  "version": "<current configs version>",
  "description": "A <Tool> configuration for <purpose>.",
  "keywords": ["<tool>", "config", "theholocron"],
  "homepage": "https://docs.theholocron.dev/holocron/configs/<tool>-config/",
  "bugs": "https://github.com/theholocron/holocron/issues",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/theholocron/holocron.git",
    "directory": "configs/<tool>-config"
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
    },
    "./package.json": "./package.json"
  },
  "files": ["dist/"],
  "scripts": {
    "delivery.build": "tsdown",
    "sourceQuality.staticAnalysis": "eslint .",
    "test:watch": "vitest",
    "verification.typeSafety": "tsc --noEmit",
    "verification.unitTests": "vitest run"
  },
  "devDependencies": {
    "@theholocron/tsconfig": "workspace:*",
    "@theholocron/vitest-config": "workspace:*",
    "@vitest/coverage-v8": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "peerDependencies": {
    "<tool>": "^<major>"
  },
  "engines": { "node": ">=22.0.0" },
  "publishConfig": { "access": "public" }
}
```

- **`version`**: copy it from any sibling (`configs/prettier-config/package.json`).
  The `configs/` folder is a version group (tags `configs-vX.Y.Z`);
  `holocron package bump-versions --group configs` moves every package together.
- **License is MIT** (ADR-0016). No `releases` or `wiki` fields.
- Packages inside the group reference each other as `workspace:*`; third-party
  dev tooling is `catalog:`. Never pin exact versions for those.
- The tool being configured goes in `peerDependencies`. Optional-per-preset
  peers also go under `peerDependenciesMeta`:
  `"peerDependenciesMeta": { "<tool>": { "optional": true } }`.
- Export each preset/bundle as a subpath (`"./presets/node"`,
  `"./bundles/library"`, …) with `types` / `import` / `default` pointing at `dist/`.
  `files: ["dist/"]` covers them.

### `tsdown.config.ts`

Config packages build with a plain tsdown config, not the shared `library`
preset: the preset lives in `@theholocron/tsdown-config`, which is itself a
config package, and these packages must not depend on the one they bootstrap.

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

Relative imports in config sources use `.js` extensions (TypeScript's ESM
convention); the resolver finds the `.ts` file at build time.

### `index.test.ts` (beside `index.ts`, no `__tests__` directory)

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

Follow `configs/prettier-config/README.md`: title, one-line description linking
the tool's own docs, Installation (`pnpm add -D @theholocron/<tool>-config <tool>`),
Usage with the exact file the user creates, then optional presets/bundles.
Keep it short; link to official docs rather than duplicating them.

## Monorepo registration

1. Run `pnpm install` from the repo root (links the workspace package, updates
   `pnpm-lock.yaml`; commit the lockfile).
2. **Codecov**: add a component under the `# configs` heading of `codecov.yml`
   (`component_id: <tool>-config`, `paths: configs/<tool>-config/**`), alphabetical.
   The file is generated by `holocron repo setup` ("write codecov.yml" step,
   `cli/astromech/src/generators/codecov`); that command needs tokens for its
   other steps, so add the block by hand in exactly that format.
3. **knip**: `knip.config.ts` has a `configs/*` workspace entry (`configPackage()`).
   Add a dedicated entry only if the package lists optional peers knip should
   ignore (see `configs/eslint-config` there).
4. **Release**: nothing to edit; the `configs` group releases by folder.
5. **Dependency catalog**: if other workspaces (packages in `clients/`, `utils/`,
   plugins, the CLI) will consume it, add it to `catalogs.configs` in
   `pnpm-workspace.yaml` once it has been published and use `catalog:configs`.
6. **Docs**: add `docs/src/content/docs/configs/<tool>-config.mdx`
   (frontmatter `title`, `description`; copy `prettier-config.mdx`), a row in
   `docs/src/content/docs/configs/index.mdx`, and
   `{ label: "<tool>-config", slug: "configs/<tool>-config" }` to the Configs
   group of the sidebar in the root `astro.config.ts` (alphabetical).

## Non-negotiables

- **TypeScript source, compiled to `dist/` via tsdown.** Never publish raw `.ts`
  or add plain `.js` source. `"files"` must be `["dist/"]`.
- **Match `version` to the configs group** — read a sibling's `package.json`.
- **Peer deps, not regular deps.** The tool being configured is a peer.
- **Deprecation notice** if replacing an existing package — add a banner at the
  top of the old package's `README.md` pointing to the replacement.
- Tests live beside the source (`index.test.ts`); no `__tests__` directory.

## Checklist

1. Create `configs/<tool>-config/` with the files above.
2. `devDependencies` include `@theholocron/tsconfig` and
   `@theholocron/vitest-config` (`workspace:*`), plus `@vitest/coverage-v8`,
   `tsdown`, `typescript`, `vitest` (`catalog:`).
3. `scripts` use the task names `delivery.build`, `verification.unitTests`,
   `verification.typeSafety`, `sourceQuality.staticAnalysis`.
4. `pnpm install`, then `pnpm --filter @theholocron/<tool>-config` run
   `delivery.build`, `verification.unitTests`, `verification.typeSafety` and
   `sourceQuality.staticAnalysis` — all must pass.
5. `codecov.yml` component, docs page, `configs/index.mdx` row and sidebar entry added.
6. `holocron run ci` passes.
7. Open a PR with a `feat(configs):` commit, signed with `-s` — semantic-release
   computes the next `configs-v*` version and publishes the group in lockstep.
   The first publish of a brand-new package needs
   `holocron package publish --initial --group configs` run by a maintainer.
