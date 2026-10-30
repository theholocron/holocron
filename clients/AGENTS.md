<!-- editorconfig-checker-disable-file -->

# clients — agent operating contract

`CLAUDE.md` is a symlink to this file. These rules apply to the `@theholocron/*-client` packages in this folder
(formerly the archived `theholocron/clients` repo). Repo-wide rules are in the root `AGENTS.md`, including how the CLI
and plugins consume these packages (`Consuming packages from clients/`). To add a client, use the
`holocron-skill-client` skill.

- `@theholocron/http-client` is the canonical home for shared HTTP primitives (`createRestClient`,
  `createResolveToken`, `ProviderApiError`). Every other client depends on it with `workspace:^`; do not re-implement
  them.
- **Tests inject fetch, they do not stub the global.** `stubFetch` comes from `@theholocron/http-client/testing`
  (published). A client may keep a `src/test-helpers.ts` for its own fixtures (such as `TOKEN`) and re-export
  `stubFetch` from there.
