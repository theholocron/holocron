<!-- editorconfig-checker-disable-file -->

# utils — agent operating contract

`CLAUDE.md` is a symlink to this file. These rules apply to the `@theholocron/*-utils` packages in this folder
(formerly the archived `theholocron/utils` repo). Repo-wide rules are in the root `AGENTS.md`.

## Architecture

- Each folder here is an independently published npm package. They release together on one version line (tags
  `utils-v*`).
- Source lives in `src/` and compiles to `dist/` with `tsdown`.
- Keep the packages small and dependency-light.

## Code patterns

- **Browser-API packages** (`location-utils`, `misc-utils`, `storage-utils`, `uri-utils`): the package
  `tsconfig.json` sets `"lib": ["dom", "dom.iterable", "es2022"]`, and the test config sets
  `environment: "happy-dom"` where the code touches a browser global. The three packages that use globals the Node
  rule does not know (`location-utils`, `misc-utils`, `storage-utils`) are listed in the root `eslint.config.ts`,
  which turns off `n/no-unsupported-features/node-builtins` for their `src/`. A new package with browser-only code
  needs the `lib` entry and the ESLint override.
- **`globals: true` in every package's `vitest.config.ts`**, as in
  `export default defineConfig(library({ globals: true }) as never)`. Tests may call `describe` / `it` / `expect`
  without importing them from `vitest`.
- **`tsdown` and `vitest` are direct `devDependencies` of every package** (`"tsdown": "catalog:"`,
  `"vitest": "catalog:"`). pnpm does not expose a transitive dependency's binary, so the package scripts fail without
  them.
- **The root `tsconfig.json` is only a solution file** and does not type-check packages. Each package has its own
  `tsconfig.json`, which its `verification.typeSafety` task uses.

## Adding a utility package

Use the `holocron-skill-util` skill (`skills/src/holocron-skill-util/SKILL.md`). By hand:

1. Create `utils/<name>-utils/` with `src/index.ts`, `package.json`, `tsdown.config.ts`, `vitest.config.ts` and
   `tsconfig.json`.
2. Re-export `@theholocron/tsdown-config/presets/library` and `@theholocron/vitest-config/bundles/library` (pass
   `globals: true`).
3. If it uses browser APIs, add the `lib` entry to its tsconfig and the package to the browser override in the root
   `eslint.config.ts`.
4. Run `holocron repo sync` so `codecov.yml` picks the package up. The release line needs no edit: the folder is a
   release group.
