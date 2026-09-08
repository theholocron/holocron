---
status: draft
issue: theholocron/holocron#582
blocked-by: []
related:
  - theholocron/holocron#581
---

# Datapad — `@theholocron/datapad`

Generic, holocron-agnostic config-file loading. Extracted from
`packages/cli/src/config/load-config.ts`; consumed by `@theholocron/cli`
(`holocron.config.*`) and `@theholocron/astromech` (`astromech.config.*`).

ADR: [ADR-0010](../docs/wiki/decisions/0010-datapad-config-loader.md).

## Scope

`packages/datapad` → `@theholocron/datapad`. Zero holocron knowledge — no
schema, no `deriveDefaults`, no provider resolution, no `tasks` manifest.

### Public API

```ts
export interface LoadOptions {
  cwd: string;
  /** Base name — resolves `<name>.config.{ts,js,mjs,cjs,json}`. */
  name: string;
  /** Extra sources to merge under the dedicated file, lowest priority last. */
  fallback?: { file: string; key: string }; // e.g. { file: "holocron", key: "tasks" }
}

export interface Loaded<T> {
  raw: T;
  /** Absolute path of the file the value came from, or null for a package.json/holocron.config key. */
  filepath: string | null;
  source: "dedicated" | "parent-key" | "package-json";
}

export function loadConfigFile<T>(opts: Omit<LoadOptions, "fallback">): Promise<Loaded<T> | null>;
export function loadLayered<T>(opts: LoadOptions): Promise<Loaded<T> | null>;
export function mergeConfig<T>(base: T, override: Partial<T>): T;
export function createDefineConfig<T>(): (config: T) => T;

export class ConfigFileError extends Error {} // found but unparseable / no default export
```

### Behaviour

- **Extension priority**: `.ts` → `.js` → `.mjs` → `.cjs` → `.json`.
  (The current CLI order is json → js → ts; datapad flips to
  TS-first since typed configs are the norm — acceptable, no external
  users. Documented as a deliberate change.)
- **Load**: JSON via `JSON.parse`; everything else via `unconfig` (loads
  TS/ESM/CJS through `jiti`, no build step, no `tsx` dep).
- **Default-export unwrap**: `unconfig` handles `export default` and
  `module.exports`; datapad does not re-implement the `__esModule`
  double-unwrap.
- **`fallback`**: when the dedicated `<name>.config.*` is absent, read
  `<fallback.file>.config.*` and take its `[fallback.key]`. If that too is
  absent, try the `[name]` key of `package.json`. Return `null` if nothing
  is found (the caller supplies defaults).
- **`mergeConfig`**: objects deep-merge, arrays concatenate, `undefined`
  on the override is skipped. Matches vite's `mergeConfig` semantics.
- **`ConfigFileError`**: thrown only when a file is found but cannot be
  loaded or has no usable export — never for "not found" (that is `null`).

### Implementation

Thin adapter over [`unconfig`](https://github.com/antfu-collective/unconfig).
datapad owns: the `<name>.config.*` naming convention, the `{ file, key }`
fallback shape, `mergeConfig` (re-exported or vite-compatible impl),
`createDefineConfig`, and `ConfigFileError`. `unconfig` +
`jiti` are runtime deps; catalogued in `pnpm-workspace.yaml`.

## Migration — `@theholocron/cli`

`packages/cli/src/config/load-config.ts` becomes:

```ts
const found = await loadConfigFile<HolocronConfig>({ cwd, name: "holocron" });
if (!found) throw new ConfigFileError("no holocron.config.{ts,js,json} found in …");
const withDefaults = await deriveDefaults(dirname(found.filepath ?? cwd), found.raw);
return { resolved: resolveConfig(withDefaults), filepath: found.filepath };
```

`deriveDefaults`, `resolveConfig`, `ConfigError`, the `HolocronConfig`
schema, and `defineConfig` all stay in `@theholocron/cli`. `tsx` is
removed from `packages/cli/package.json` dependencies. Existing
`load-config.test.ts` cases keep passing (behaviour is unchanged except
the documented extension-order flip and the now-supported `.mjs`/`.cjs`).

## Plumbing

- `pnpm-workspace.yaml` — `catalog:` entries for `unconfig`, `jiti`;
  `@theholocron/datapad` under `catalog:`; already covered by the
  `overrides:` collapse.
- Lockstep release: `scripts/bump-versions.mjs` package list, Trusted
  Publisher registration (`holocron npm publish-initial`), `codecov.yml`
  component, docs-theme registry entry, `astro.config` / Fern sidebar,
  `docs/.../` page, root `README.md` package map.
- `knip.config.ts` `ignoreDependencies` if needed.

## Non-goals

- Config schema / validation — the consumer's job.
- Layered env / `.env` / remote config / watch mode (`c12` territory) —
  revisit only if a real need appears.
- A `holonet` package — the name is reserved for a future sync/broadcast
  layer, unrelated to config.

## Test plan

- `load-config-file.test.ts` — extension priority; `.ts`/`.js`/`.mjs`/
  `.cjs`/`.json` each load; missing → `null`; malformed → `ConfigFileError`;
  no default export → `ConfigFileError`.
- `load-layered.test.ts` — dedicated file wins; `fallback.key` picked up
  from the parent file; `package.json` key last; `null` when nothing.
- `merge-config.test.ts` — object deep-merge, array concat, `undefined`
  skip, nested.
- `define-config.test.ts` — identity passthrough, type inference.
- CLI: `load-config.test.ts` unchanged assertions pass post-migration.

## Phase

Single PR (#582). Lands before or with astromech Phase 2b (#581 tracking).
