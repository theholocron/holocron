<!-- editorconfig-checker-disable-file -->

# configs — agent operating contract

`CLAUDE.md` is a symlink to this file. These rules apply to the packages in this folder, mostly `@theholocron/*-config`
(formerly the archived `theholocron/configs` repo). Repo-wide rules are in the root `AGENTS.md`. To add a config, use
the `holocron-skill-config` skill (model it on `prettier-config`).

- `rollup-plugin-transform-template` is a build-tool plugin rather than a shareable config; it is versioned and
  published the same way. `browserslist-config` and `tsconfig` are CommonJS / data packages (see their exceptions in
  the root `eslint.config.ts`).
- Imports in source use `.js` extensions (the TypeScript ESM convention; the resolver finds the `.ts` file).
- **Peer dependencies.** Every tool a config wraps goes in `peerDependencies`, marked
  `peerDependenciesMeta.<name>.optional: true` when a consumer may not use every preset (multi-preset packages such as
  `eslint-config`). The root `eslint.config.ts` turns off `package-json/peer-dependencies-as-dev-dependencies` for
  `configs/*/package.json` for this reason.
- **Named exports for multi-preset packages** (`eslint-config` exports `base`, `typescript`, ...). Single-purpose
  packages (`prettier-config`, `commitlint-config`) use a default export.
- **Bundles** combine presets and opinionated settings into one import. Put them in a `bundles/` folder with a file per
  use case (`bundles/library.ts`). A bundle takes options as a parameter (`library({ browserPackages })`) instead of
  each repo forking it. A repo-local override that turns out to be universal moves into the shared package, not into a
  copy per package.
- Each package has an `index.test.ts` smoke test (every export has the expected runtime shape). `tsdown.config.ts` must
  list every entry point that needs its own dist file, and `verification.unitTests` depends on `delivery.build`, so
  tests run against a built package.
