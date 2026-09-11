---
status: accepted
issue: theholocron/holocron#582
blocked-by: []
related:
  - theholocron/holocron#581
---

# Datapad — `@theholocron/datapad`

Generic, holocron-agnostic config-file loading. Extracted from
`packages/cli/src/config/load-config.ts`; consumed by `@theholocron/cli`
(`holocron.config.*`) and `@theholocron/astromech` (`astromech.config.*`).

ADR: [ADR-0010](../decisions/0010-datapad-config-loader.md).
Shipped in PR #582.

## Scope

`packages/datapad` → `@theholocron/datapad`. Zero holocron knowledge — no
schema, no `deriveDefaults`, no provider resolution, no `tasks` manifest.

### Public API

```ts
export const DEFAULT_EXTENSIONS = ["ts", "js", "mjs", "cjs", "json"] as const;

export interface LoadConfigFileOptions {
  cwd: string;
  /** Base name — resolves `<name>.config.{ts,js,mjs,cjs,json}`. */
  name: string;
  /** Override the extension probe order. */
  extensions?: readonly string[];
}
export interface Loaded<T> {
  config: T;
  filepath: string; // absolute
}
export function loadConfigFile<T>(opts: LoadConfigFileOptions): Promise<Loaded<T> | null>;

export interface LoadLayeredOptions extends LoadConfigFileOptions {
  fallback?: { file: string; key: string }; // e.g. { file: "holocron", key: "tasks" }
}
export interface LayeredResult<T> {
  config: T;
  filepath: string | null; // dedicated file, else fallback file, else null
  sources: string[]; // absolute paths merged, lowest priority first
}
export function loadLayered<T>(opts: LoadLayeredOptions): Promise<LayeredResult<T> | null>;

export function mergeConfig<T>(base: T, override: unknown): T;
export function createDefineConfig<T>(): <C extends T>(config: C) => C;

export class ConfigFileError extends Error {
  filepath?: string; // the offending file, when known
}
```

### Behaviour

- **Extension priority**: `.ts` → `.js` → `.mjs` → `.cjs` → `.json`
  (overridable via `extensions`). This flips the old CLI order
  (`json → js → ts`) to TS-first and adds `.mjs` / `.cjs` — a deliberate
  break; the org is the only consumer. Two `load-config.test.ts` priority
  assertions were rewritten.
- **Load**: JSON via `JSON.parse`; `.js` / `.mjs` / `.cjs` via native
  dynamic `import()`; `.ts` via `tsx` (see below).
- **Default-export unwrap**: ported from the old loader — `.default`, with
  the extra `{ __esModule: true, default }` layer `tsx`'s CJS transform
  produces stripped when present.
- **`fallback`**: when the dedicated `<name>.config.*` is absent, read
  `<fallback.file>.config.*` and take its `[fallback.key]`. When **both**
  exist, the dedicated file is `mergeConfig`'d on top (dedicated wins).
  Returns `null` when neither resolves (the caller supplies defaults).
- **`mergeConfig`**: plain objects deep-merge, arrays concatenate
  (`base` first), `undefined` in `override` is skipped, every other
  `override` value replaces `base`. Neither input is mutated. Matches
  vite's `mergeConfig`.
- **`ConfigFileError`**: thrown only when a file is found but cannot be
  loaded / parsed / has no usable export — never for "not found" (`null`).

### Implementation — ported, not `unconfig`

The old `load-config.ts` loader (~90 lines of loading logic) is ported and
generalised rather than replaced with `unconfig`:

- `unconfig-core` (already transitively in the tree) has **no** built-in
  TS loading — the caller supplies a `parser` per source, i.e. the same
  code.
- Full `unconfig` bundles `jiti` + `@antfu/utils` — heavier than the win,
  and would swap the proven `tsx` path for `jiti` with its own edge cases.
- `tsx` stays: moved from `@theholocron/cli`'s `dependencies` to
  `@theholocron/datapad`'s (net neutral — `cli` keeps `tsx` as a
  devDependency for its `tsdown --config-loader tsx` build).

**TS loader — `register()`, not `tsImport()`.** `tsImport` runs a
one-off register/unregister cycle that is not reentrant; a single
`loadLayered` call loads two TS files (dedicated + parent), and a suite
that loads several `.ts` configs in one process hit
`__filename is not defined in ES module scope`. datapad calls `tsx`'s
persistent `register()` once per process (lazily, on first `.ts` load)
and then a plain dynamic `import()`.

## Migration — `@theholocron/cli`

`packages/cli/src/config/load-config.ts` shrinks to:

```ts
import { ConfigFileError, loadConfigFile } from "@theholocron/datapad";
export { ConfigFileError } from "@theholocron/datapad";

export async function loadConfig(cwd: string): Promise<LoadedConfig> {
  const found = await loadConfigFile<HolocronConfig>({ cwd, name: "holocron" });
  if (!found) throw new ConfigFileError(`no holocron.config.{ts,js,mjs,cjs,json} found in ${cwd}…`);
  const withDefaults = await deriveDefaults(dirname(found.filepath), found.config);
  return { resolved: resolveConfig(withDefaults), filepath: found.filepath };
}
```

`deriveDefaults`, `readPackageJsonName`, `readGitRemote`,
`parseGitRemoteUrl`, `resolveConfig`, `ConfigError`, the `HolocronConfig`
schema, and `defineConfig` all stay in `@theholocron/cli`.
`ConfigFileError` is re-exported from `load-config.ts` (kept in the
`@theholocron/cli` public API via `index.ts`). Malformed JSON now throws
`ConfigFileError` (was `ConfigError`) — one test updated.

## Plumbing

- `packages/cli/package.json` — `@theholocron/datapad: workspace:*` added
  to `dependencies`; `tsx` moved to `devDependencies`.
- `codecov.yml` — `datapad` component.
- `knip.config.ts` — `packages/datapad` workspace entry.
- Root `README.md` — package map row.
- `holocron bump-versions` picks up any non-private `packages/*`
  automatically — no script edit. Trusted Publisher must be registered
  before the first publish (`holocron publish --initial`).
- **Companion PR** `theholocron/docs#40` — `@theholocron/registry-doc`
  `datapad` entry (in `tools`, beside `logger`). `scripts/validate-registry.mjs`
  fails here until that merges → registry-doc releases → `@theholocron/registry-doc`
  is bumped in this repo.

## Non-goals

- Config schema / validation — the consumer's job.
- Layered env / `.env` / remote config / watch mode (`c12` territory).
- A `package.json`-key source — dropped as YAGNI; add if a real need
  appears.
- A `holonet` package — the name is reserved for a future sync/broadcast
  layer, unrelated to config.

## Tests

- `merge.test.ts` — deep-merge, array concat, `undefined` skip, non-object
  override, no-mutation, null-prototype.
- `define.test.ts` — identity passthrough + literal-type preservation.
- `load.test.ts` — `null` when absent; `.json` / `.js` / `.mjs` / `.cjs` /
  `.ts` each load; TS-first probe order; custom `extensions`; malformed
  JSON / syntax error / throwing config / no default export →
  `ConfigFileError` with `filepath`; `loadLayered` dedicated-only,
  fallback-key-only, both-merged, no-fallback, `null`.
- `packages/cli` `load-config.test.ts` — 19 tests green post-migration
  (2 priority assertions rewritten TS-first; 1 malformed-JSON error type).

## Phase

Single PR (#582). Lands before astromech Phase 2b (#583).
