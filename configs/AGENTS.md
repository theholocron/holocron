<!-- editorconfig-checker-disable-file -->

# configs — agent operating contract

`CLAUDE.md` is a symlink to this file. These rules apply to the packages in this folder, mostly `@theholocron/*-config`
(formerly the archived `theholocron/configs` repo). Repo-wide rules are in the root `AGENTS.md`.

## Architecture

- Each folder here is an independently published npm package. They release together on one version line (tags
  `configs-v*`). `rollup-plugin-transform-template` is a build-tool plugin rather than a shareable config; it is
  versioned and published the same way.
- Written in TypeScript and compiled to `dist/` with `tsdown`. Imports in source use `.js` extensions (the TypeScript
  ESM convention; the resolver finds the `.ts` file).
- `browserslist-config` and `tsconfig` are CommonJS / data packages (see their exceptions in the root
  `eslint.config.ts`).

## Code patterns

- **Peer dependencies.** Every tool a config wraps goes in `peerDependencies`, marked
  `peerDependenciesMeta.<name>.optional: true` when a consumer may not use every preset (multi-preset packages such as
  `eslint-config`). The root `eslint.config.ts` turns off `package-json/peer-dependencies-as-dev-dependencies` for
  `configs/*/package.json` for this reason.
- **Named exports for multi-preset packages** (`eslint-config` exports `base`, `typescript`, ...). Single-purpose
  packages (`prettier-config`, `commitlint-config`) use a default export.
- **Bundles** combine presets and opinionated settings into one import. Put them in a `bundles/` folder with a file per
  use case (`bundles/library.ts`). A bundle takes options as a parameter (`library({ browserPackages })`) instead of
  each repo forking it.
- **A repo-local override that turns out to be universal moves into the shared package** (as
  `n/no-unpublished-import: off` did into `library()`), not into a copy per package.

## Adding a config package

Use the `holocron-skill-config` skill (`skills/src/holocron-skill-config/SKILL.md`). The shape, modelled on
`prettier-config`:

1. `package.json`, `index.ts`, `tsconfig.json` (extends `@theholocron/tsconfig/node-lts`, `rootDir: "."`,
   `outDir: "dist"`), `tsdown.config.ts` (list every entry point that needs its own dist file), `vitest.config.ts`
   (the `node` preset from `@theholocron/vitest-config`), `index.test.ts` and a `README.md` with Installation and
   Usage sections.
2. `index.test.ts` is a smoke test: every export has the expected runtime shape.
3. Add `tsdown`, `vitest` and `@theholocron/vitest-config` (`workspace:*`) to `devDependencies`.
4. Run `holocron repo sync` so the codecov flag and component are added.

`verification.unitTests` depends on `delivery.build`, so tests run against a built package.
