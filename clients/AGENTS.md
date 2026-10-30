<!-- editorconfig-checker-disable-file -->

# clients — agent operating contract

`CLAUDE.md` is a symlink to this file. These rules apply to the `@theholocron/*-client` packages in this folder
(formerly the archived `theholocron/clients` repo). Repo-wide rules are in the root `AGENTS.md`, including how the CLI
and plugins consume these packages (`Consuming packages from clients/`).

## Architecture

- Each folder here is an independently published npm package. They release together on one version line (tags
  `clients-v*`). Source lives in `src/` and compiles to `dist/` with `tsdown`.
- `@theholocron/http-client` is the canonical home for shared HTTP primitives (`createRestClient`,
  `createResolveToken`, `ProviderApiError`). Every other client depends on it; do not re-implement them.

## Code patterns

- **Tests inject fetch, they do not stub the global.** `stubFetch` comes from `@theholocron/http-client/testing`
  (published). A client may keep a `src/test-helpers.ts` for its own fixtures (such as `TOKEN`) and re-export
  `stubFetch` from there.
- `n/no-unpublished-import` is off for the `src/` to `dist/` build model in the shared `library()` ESLint bundle
  (`configs/eslint-config/bundles/library.ts`). Do not turn it off again per package.

## Adding a client package

Use the `holocron-skill-client` skill (`skills/src/holocron-skill-client/SKILL.md`). The package must:

1. Depend on `@theholocron/http-client` with `workspace:^`.
2. Start at the group's current version (copy it from another `clients/*/package.json`), so it joins the
   `clients-v*` line.
3. Be followed by `holocron repo sync`, which adds its codecov flag and component.
