---
name: holocron-plugin
description: Scaffold a new @theholocron/holocron-plugin-<slug> package. Since v2.0.0-alpha, this is a first-class CLI command — use it directly.
---

<!-- editorconfig-checker-disable-file -->

# Scaffold a new holocron plugin

Since v2.0.0-alpha, plugin scaffolding is a first-class CLI command.
Skip this skill; just run:

<!-- prettier-ignore -->
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
- 1 validation script (`scripts/validate.mjs`) — read-only smoke
  test against a live vendor account; invoked via
  `pnpm --filter @theholocron/holocron-plugin-<slug> validate`

Then follow the "Next" steps printed by the command:

1. `pnpm install`
2. `pnpm --filter @theholocron/holocron-plugin-<slug> typecheck lint test`
3. Fill in the `<VendorName><Capability>` class methods against the
   capability interface in `packages/cli/src/capabilities/index.ts`.
4. Replace `it.todo(...)` with real tests.
5. Commit + push when the capability is functionally complete.
6. **Wire a typed client** (see below) once `@theholocron/<slug>-client`
   exists in the `theholocron/clients` repo.

## Step 6: migrate to a typed client

The scaffolded `rest.ts` uses the raw `createRestClient` from `@theholocron/cli`.
Once a typed client package exists for the vendor (in `theholocron/clients`),
replace it.

**`src/rest.ts`** — swap to a re-export:

```ts
export {
  create<Vendor>Client,
  type <Vendor>Client,
  type <Vendor>ClientOptions,
} from "@theholocron/<slug>-client";
```

**`src/index.ts`** — change `PluginContext.rest: RestClient` to `client: <Vendor>Client`:

```ts
export interface PluginContext {
  options: <Vendor>PluginOptions;
  client: <Vendor>Client;
}

export function createContext(options: <Vendor>PluginOptions): PluginContext {
  const token = resolveToken(options);
  return {
    options,
    client: create<Vendor>Client({ token, baseUrl: options.baseUrl, fetch: options.fetch }),
  };
}
```

**`src/capabilities/<key>.ts`** — constructor takes `<Vendor>Client` instead of `RestClient`:

```ts
import type { <Vendor>Client } from "@theholocron/<slug>-client";

constructor(private readonly client: <Vendor>Client, ...) {}
```

Replace all `this.rest.request<T>(...)` calls with typed client methods
(`this.client.<resource>.<method>(...)`).

**`src/verify-token.ts`** — use the typed client:

```ts
import { create<Vendor>Client } from "./rest.js";

const client = create<Vendor>Client({ token, ... });
const res = await client.<resource>.<method>();
```

**`pnpm-workspace.yaml` catalog + plugin `package.json`** — add the client:

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

**Tests** — update `makeXxx()` helpers to call `create<Vendor>Client` instead
of the inline rest client factory; import any error classes (e.g. `PostmanPlanLimitError`)
from the client package rather than the plugin's own `errors.ts`.

## Design context

- `.notes/tool-plugin-create.spec.md` — the CLI's own design spec.
- `.notes/tech-auth-bootstrap.spec.md` — the 4-step token precedence
  every plugin's `auth.ts` follows (`--token` → `HOLOCRON_<X>_TOKEN`
  → `<vendor>-native env` → keyring lookup → `AuthError`).
- `.notes/tech-vault-choice.spec.md` — the reasoning that made
  Doppler + Infisical (and the keyring foundation) part of v2.

## Command source

`packages/cli/src/commands/plugin-create/` — 18 templates,
orchestrator, and unit tests. Editing a template ripples to every
future plugin scaffolded by this command.
