<!-- editorconfig-checker-disable-file -->

# utils — agent operating contract

`CLAUDE.md` is a symlink to this file. These rules apply to the `@theholocron/*-utils` packages in this folder
(formerly the archived `theholocron/utils` repo). Repo-wide rules are in the root `AGENTS.md`. To add a package, use the
`holocron-skill-util` skill.

- **Browser-API packages** (`location-utils`, `misc-utils`, `storage-utils`, `uri-utils`): the package `tsconfig.json`
  sets `"lib": ["dom", "dom.iterable", "es2022"]`, and the test config sets `environment: "happy-dom"` where the code
  touches a browser global. The three packages that use globals the Node rule does not know (`location-utils`,
  `misc-utils`, `storage-utils`) are listed in the root `eslint.config.ts`, which turns off
  `n/no-unsupported-features/node-builtins` for their `src/`. A new package with browser-only code needs the `lib`
  entry and the ESLint override.
- **`globals: true` in every package's `vitest.config.ts`**, as in
  `export default defineConfig(library({ globals: true }) as never)`. Tests may call `describe` / `it` / `expect`
  without importing them from `vitest`.
- **The root `tsconfig.json` is only a solution file** and does not type-check packages. Each package has its own
  `tsconfig.json`, which its `verification.typeSafety` task uses.
