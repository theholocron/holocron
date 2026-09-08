# ADR-0010 — Datapad: the shared config loader

## Status

Proposed

## Context

`packages/cli/src/config/load-config.ts` (~140 lines) does two unrelated
things:

1. **Generic config file loading** — walk `holocron.config.{json,js,ts}`
   in priority order, parse JSON directly, load JS via native dynamic
   import, load TS via `tsx`'s `tsImport`, then unwrap the default export
   (including the CJS/ESM `__esModule` double-wrap `tsx` produces).
2. **Holocron-specific resolution** — `deriveDefaults` (fill `name` from
   `package.json`, `repo.name` from the git remote) and `resolveConfig`
   (schema validation, provider tuple resolution, capability-config-package
   expansion).

ADR-0009 introduces `@theholocron/astromech`, which needs a **second**
config file (`astromech.config.{ts,js,json}`), the same TS-loading and
default-export handling, plus "fall back to the `tasks` key in
`holocron.config.*`" and a vite-style `mergeConfig`. Copying (1) into
astromech would fork the loader — the `tsx` version pin, the unwrap edge
cases, the search-order contract (#75 / #81) would drift between two
packages.

## Decision

### Extract `@theholocron/datapad`

A new workspace library at `packages/datapad`. It owns **only** concern
(1) — generic, holocron-agnostic config file loading. A datapad is a
handheld device for reading and holding data; this is that for config
files.

```ts
import { loadConfigFile, loadLayered, mergeConfig, createDefineConfig } from "@theholocron/datapad";

// single file: holocron.config.{ts,js,mjs,cjs,json}
const found = await loadConfigFile<HolocronConfig>({ cwd, name: "holocron" });
// → { raw, filepath } | null

// layered: astromech.config.* OR the `tasks` key of holocron.config.* OR null
const layers = await loadLayered<TasksConfig>({
  cwd,
  name: "astromech",
  fallback: { file: "holocron", key: "tasks" },
});
// → { raw, filepath, source: "dedicated" | "parent-key" } | null

const merged = mergeConfig(defaults, layers?.raw ?? {}); // vite-style deep merge

// each consumer builds its own typed identity helper
export const defineConfig = createDefineConfig<TasksConfig>();
```

What datapad handles: extension priority, JSON parse, JS/TS/ESM/CJS
load, the default-export unwrap, `package.json`-key fallback, deep-merge
semantics (objects merge, arrays concat, `undefined` skipped),
`ConfigFileError` for "found but unloadable". What it does **not** know
about: any holocron schema, `deriveDefaults`, provider resolution, the
`tasks` manifest — those stay with their owners.

### Wrap `unconfig`, don't hand-roll

datapad is a thin adapter over [`unconfig`](https://github.com/antfu-collective/unconfig)
(unjs ecosystem): it already does extension walking, `package.json`
sources, source merging, and `defineConfig`, and loads TS via `jiti`
(dropping the `tsx` runtime dep and the hand-rolled `__esModule`
unwrap). datapad adds the theholocron naming conventions, the
`{ file, key }` fallback shape, typed `createDefineConfig`, and a stable
public surface so a loader swap never touches consumers.

Alternatives considered: `cosmiconfig` (no built-in TS loader),
`lilconfig` (same gap), `c12` (layers / `.env` / remote / watch — more
than needed now; revisit if config layering grows).

### Consumers

| Package                  | Uses datapad for                                                 | Keeps                                                                                  |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `@theholocron/cli`       | load `holocron.config.*`                                         | `deriveDefaults`, `resolveConfig`, the `HolocronConfig` schema, its own `defineConfig` |
| `@theholocron/astromech` | load `astromech.config.*` + `tasks`-key fallback + `mergeConfig` | `TasksConfig` schema + validation, its own `defineConfig`                              |

`@theholocron/cli`'s `load-config.ts` shrinks to: `loadConfigFile(...)` →
`deriveDefaults` → `resolveConfig`. One deliberate behaviour change: the
extension probe order flips to TS-first (`.ts` → `.js` → `.mjs` → `.cjs`
→ `.json`) and `.mjs` / `.cjs` become supported — typed configs are the
norm and there are no external consumers to break.

### `holonet` is reserved

Not this package. `holonet` (the galaxy's comms network) is reserved for
a future cross-repo sync / broadcast layer (wiki navbar broadcast,
`sync-github`, Discord logging) if that machinery is ever consolidated.

## Amendment (2026-09-08) — ported, not `unconfig`

Implementation (#582) revised the "wrap `unconfig`" decision:

- `unconfig-core` (the package already in the tree) has **no** built-in TS
  loading — each source needs a hand-written `parser`, i.e. the same code.
- Full `unconfig` bundles `jiti` + `@antfu/utils`, heavier than the win,
  and would swap the proven `tsx` path for `jiti`.

So datapad **ports** the existing ~90-line loader and generalises it.
`tsx` stays — moved from `@theholocron/cli`'s `dependencies` to
`@theholocron/datapad`'s (`cli` keeps it as a devDependency for its
build). The TS loader uses `tsx`'s persistent `register()` rather than the
one-off `tsImport()`, which is not reentrant across the multiple TS
configs a single `loadLayered` run can touch.

## Consequences

- One more package in the lockstep release (Trusted Publisher,
  `codecov.yml` component, docs-theme registry) — but versioned in step
  with the other nine, so no independent release cadence.
- `tsx` moves from `@theholocron/cli`'s runtime dependencies into
  `@theholocron/datapad`; one loader implementation, one place to fix an
  unwrap bug or bump the TS loader.
- `@theholocron/cli` and `@theholocron/astromech` both depend on
  `@theholocron/datapad`; the `overrides:` block in `pnpm-workspace.yaml`
  already collapses shared `@theholocron/*` deps to one version, so no
  dual-instance risk.
- Migration is mechanical and behind an unchanged public contract; it can
  land before or alongside the astromech scaffold (ADR-0009 Phase 2).

## References

- Issues: #582 (extraction), #581 (astromech — the second consumer)
- ADR-0009 — astromech; its config system sits on top of datapad
- ADR-0007 — `@theholocron/logger`, the precedent for a small
  self-contained library the CLI depends on
- `unconfig`: https://github.com/antfu-collective/unconfig
- Search-order contract: #75 / #81
