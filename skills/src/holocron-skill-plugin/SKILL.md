---
name: holocron-skill-plugin
title: "Holocron: New Plugin"
description: Scaffold a new @theholocron/holocron-plugin-<slug> package. INVOKE WHEN: user asks to add a new provider plugin to theholocron/holocron. Since v2.0.0-alpha, use the CLI command instead. Invoked as /holocron-skill-plugin.
---

<!-- editorconfig-checker-disable-file -->

# Scaffold a new holocron plugin

Since v2.0.0-alpha, plugin scaffolding is a first-class CLI command.
Skip this skill; run:

```bash
pnpm holocron plugin create <slug> <vendor> \
    --capability <key> \
    --vendor-env <VENDOR_NATIVE_ENV_NAME> \
    --base-url <https://api.vendor.example>
```

The command produces 18 files under `packages/holocron-plugin-<slug>/`
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
- 1 validation script (`scripts/validate.mjs`)

Then follow the "Next" steps printed by the command:

1. `pnpm install`
2. `pnpm --filter @theholocron/holocron-plugin-<slug> typecheck lint test`
3. Fill in the `<VendorName><Capability>` class methods against the
   capability interface in `packages/cli/src/capabilities/index.ts`.
4. Replace `it.todo(...)` with real tests.
5. Commit + push when the capability is functionally complete.
6. **Wire a typed client** once `@theholocron/<slug>-client` exists.

## Step 6: migrate to a typed client

The scaffolded `rest.ts` uses the raw `createRestClient` from `@theholocron/cli`.
Once a typed client package exists in `theholocron/clients`, replace it:

**`src/rest.ts`** — swap to a re-export:

```ts
export {
  create<Vendor>Client,
  type <Vendor>Client,
  type <Vendor>ClientOptions,
} from "@theholocron/<slug>-client";
```

**`pnpm-workspace.yaml` catalog + plugin `package.json`:**

```yaml
# pnpm-workspace.yaml
catalog:
    "@theholocron/<slug>-client": ^<version>
```

```json
"peerDependencies": { "@theholocron/<slug>-client": "catalog:" },
"peerDependenciesMeta": { "@theholocron/<slug>-client": { "optional": false } },
"devDependencies": { "@theholocron/<slug>-client": "catalog:" }
```

## Auth pattern (4-step precedence)

Every plugin's `auth.ts` follows this order:
1. `--token` CLI flag (`RuntimeContext.cliToken`)
2. `HOLOCRON_<VENDOR>_TOKEN` env var
3. `<VENDOR_NATIVE_ENV_VAR>` env var
4. Keyring lookup → `AuthError` if all fail

## Design references

- `.notes/tool-plugin-create.spec.md` — CLI scaffolding spec
- `.notes/tech-auth-bootstrap.spec.md` — 4-step token precedence
- `.notes/tech-vault-choice.spec.md` — Doppler + Infisical adoption
