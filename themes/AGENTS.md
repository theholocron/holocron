<!-- editorconfig-checker-disable-file -->

# themes — agent operating contract

`CLAUDE.md` is a symlink to this file. These rules apply to the packages in this folder (today
`@theholocron/docs-theme`; formerly the archived `theholocron/themes` repo). They release on one version line (tags
`themes-v*`). Repo-wide rules are in the root `AGENTS.md`.

## Architecture

- Source lives in `src/` and compiles to `dist/` with `tsdown`.
- CSS in `src/` is not processed by `tsdown`. The build script copies it (`tsdown && cp src/styles.css dist/`).
- `@theholocron/docs-theme` is a Starlight plugin. It finds its CSS at runtime with
  `fileURLToPath(new URL("./styles.css", import.meta.url))`, which resolves to `dist/styles.css` after the build. A
  change to the copy step therefore breaks consumers without failing the TypeScript build.

## Adding a package that ships CSS

Add `"sideEffects": ["*.css"]` to its `package.json` and a copy step for its CSS files to the build script.
