---
name: holocron-plugin
description: Scaffold a new @theholocron/holocron-plugin-<slug> package. Since v2.0.0-alpha, this is a first-class CLI command — use it directly.
---

<!-- editorconfig-checker-disable-file -->

# Scaffold a new holocron plugin

Since v2.0.0-alpha, plugin scaffolding is a first-class CLI command.
Skip this skill; just run:

```bash
pnpm holocron plugin create <slug> <vendor> \
    --capability <key> \
    --vendor-env <VENDOR_NATIVE_ENV_NAME> \
    --base-url <https://api.vendor.example>
```

The command produces 17 files under `packages/holocron-plugin-<slug>/`
matching the same template this skill used to hand-craft:

- 5 config files (`package.json`, `tsconfig.json`, `vitest.config.ts`,
  `eslint.config.js`, `tsdown.config.ts`)
- 1 `README.md`
- 5 source files (`auth.ts` with 4-step keyring precedence, `rest.ts`,
  `verify-token.ts`, `index.ts` with `AUTH_HINT` export,
  `capabilities/<key>.ts` stub)
- 6 test files (`helpers.ts`, `auth.test.ts`, `rest.test.ts`,
  `verify-token.test.ts`, `<key>.test.ts` with `it.todo`,
  `index.test.ts`)

Then follow the "Next" steps printed by the command:

1. `pnpm install`
2. `pnpm --filter @theholocron/holocron-plugin-<slug> typecheck lint test`
3. Fill in the `<VendorName><Capability>` class methods against the
   capability interface in `packages/cli/src/capabilities/index.ts`.
4. Replace `it.todo(...)` with real tests.
5. Commit + push when the capability is functionally complete.

## Design context

- `.notes/tool-plugin-create.spec.md` — the CLI's own design spec.
- `.notes/tech-auth-bootstrap.spec.md` — the 4-step token precedence
  every plugin's `auth.ts` follows (`--token` → `HOLOCRON_<X>_TOKEN`
  → `<vendor>-native env` → keyring lookup → `AuthError`).
- `.notes/tech-vault-choice.spec.md` — the reasoning that made
  Doppler + Infisical (and the keyring foundation) part of v2.

## Command source

`packages/cli/src/commands/plugin-create/` — 17 templates + orchestrator
+ unit tests. Editing a template ripples to every future plugin
scaffolded by this command.
