---
title: "ADR 002: Composable Preset System"
description: Replace monolithic preset functions with composable capability fragments.
---

## Status

Proposed

## Problem

The current preset system (`node()`, `nodeDocs()`) uses inheritance: each preset
function hard-codes a full workflow list by spreading a parent's array and
appending. This creates a combinatorial explosion as repos diverge — we already
need a `nodeDocsSite()` variant to handle docs-only repos, and that's after two
presets. Every new combination (monorepo + docs, Next.js + Storybook, etc.)
requires a new function or a filter at the call site.

## Decision

Replace preset functions with composable **capability fragments**. Each
capability is a self-contained object that describes one concern. A `compose()`
call merges any number of capabilities into a single config fragment that
spreads into `defineConfig()`.

---

## Core types

### `Capability`

```ts
interface Capability {
  /** Unique ID — used for deduplication and dependency resolution. */
  id: string;

  /**
   * Other capability IDs that must be present in the same compose() call.
   * compose() throws at call time if any are missing.
   */
  requires?: string[];

  /** Workflow entries contributed by this capability. Merged by name. */
  workflows?: WorkflowEntry[];

  /** Provider config. Shallow-merged; later capabilities override per-key. */
  providers?: HolocronConfig["providers"];

  /**
   * CI check names that must pass for branch protection.
   * Unioned across all capabilities.
   */
  requiredChecks?: string[];

  /** Repo config fragment. See merge rules below. */
  repo?: Partial<RepoConfig>;

  /** Sets config.org when present. Last writer wins. */
  org?: string;

  /** Sets config.domain when present. Last writer wins. */
  domain?: string;

  /** Sets config.docs when present. Last writer wins. */
  docs?: HolocronConfig["docs"];
}
```

### `ComposedPreset`

The return type of `compose()`. Spreads cleanly into `defineConfig()`.

```ts
interface ComposedPreset {
  workflows: WorkflowEntry[];
  providers: HolocronConfig["providers"];
  repo: Partial<RepoConfig> & { requiredChecks: string[] };
  org?: string;
  domain?: string;
  docs?: HolocronConfig["docs"];
}
```

---

## `compose()` API

```ts
function compose(...capabilities: (Capability | Capability[])[]): ComposedPreset;
```

Accepts individual capabilities or nested arrays (for bundle presets — see
below). Flattens, deduplicates, validates dependencies, and merges.

### Usage

```ts
// docs-only site — no typecheck
const preset = compose(node(), docs());

// library with docs
const preset = compose(node(), typecheck(), docs());

// React app with full stack
const preset = compose(node(), typecheck(), react(), storybook(), cypress(), docs());

// shorthand — nextjs() bundles typecheck + react + storybook + cypress + docs
const preset = compose(node(), nextjs());

// monorepo adjusts paths and workspace-level config
const preset = compose(node(), typecheck(), docs(), monorepo());
```

Then in `defineConfig()`:

```ts
export default defineConfig({
  ...preset,
  description: "...",
  repo: { ...preset.repo, name: "theholocron/my-lib", topics: ["typescript"] },
  workflows: [...preset.workflows, "audit", "sync"],
});
```

---

## Merge rules

### `workflows`

- Each entry is normalised to `{ name: string; with?: …; paths?: … }`.
- Deduplication: if two capabilities declare the same `name`, the **later one
  wins** (order in `compose()` call = order of precedence, left-to-right).
- This allows a bundle preset like `nextjs()` to set defaults that the caller
  can override by listing an explicit capability after it.

### `providers`

Shallow-merge at the top level (source, ci, deployment, dns, …). Later
capabilities override individual keys.

### `requiredChecks`

Set union. Order within the final array is: base capability checks first, then
additive capabilities in call order.

### `repo`

- Scalar fields (`protection`, `name`): last writer wins.
- `properties`: `Object.assign` merge — later overrides earlier per-key.
- `topics`, `teams`: union (no duplicates).
- `requiredChecks`: union (see above).

### `org`, `domain`, `docs`

Last writer wins.

---

## Dependency enforcement

`compose()` checks all `requires` before merging. If any are unmet it throws
a `ConfigError` at call time — not at CI time.

```
ConfigError: capability "react" requires "typecheck" — add typecheck() to your compose() call
```

Multiple missing deps are reported together, not one at a time.

---

## Bundle presets

A bundle preset is a function that **returns `Capability[]`**, not a single
`Capability`. `compose()` flattens nested arrays, so bundles compose
transparently.

```ts
// nextjs() is a bundle — it returns an array of capabilities
export function nextjs(): Capability[] {
  return [typecheck(), react(), storybook(), cypress(), docs(), nextjsCapability()];
}

// compose() flattens and deduplicates:
compose(node(), typecheck(), nextjs());
//  → node, typecheck (x2 → deduped to one), react, storybook, cypress, docs, nextjs
```

Deduplication means `compose(node(), typecheck(), nextjs())` is identical to
`compose(node(), nextjs())` — the explicit `typecheck()` is redundant but not
an error. This makes compositions self-documenting without being fragile.

---

## Capabilities catalogue

| Capability            | ID          | Requires    | Contributes                                                                          |
| --------------------- | ----------- | ----------- | ------------------------------------------------------------------------------------ |
| `node()`              | `node`      | —           | lint, test, codeql, review, stale, greetings, dependencies, bookkeeping              |
| `typecheck()`         | `typecheck` | `node`      | typecheck workflow + "Typecheck / Conclusion" required check                         |
| `docs()`              | `docs`      | `node`      | deploy+preview+cleanup workflows; Cloudflare + DNS providers; org/domain/docs fields |
| `react()`             | `react`     | `typecheck` | react-specific ESLint/TS config in review; stubs storybook if absent                 |
| `storybook()`         | `storybook` | `node`      | storybook job in test workflow; chromatic job in deploy                              |
| `cypress()`           | `cypress`   | `node`      | cypress job in test workflow                                                         |
| `nextjs()` _(bundle)_ | —           | —           | returns `[typecheck(), react(), storybook(), cypress(), docs(), nextjsCapability()]` |
| `monorepo()`          | `monorepo`  | `node`      | adjusts `on.push.paths` across all workflows to workspace layout; adds turbo         |
| `audit()`             | `audit`     | `node`      | BundleWatch + Knip; "audit / Conclusion" required check                              |

---

## Where each piece lives

| Piece                                                          | Package                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| `Capability` type, `ComposedPreset` type, `compose()` function | `@theholocron/cli` — `src/config.ts`                     |
| `ConfigError` for missing deps                                 | `@theholocron/cli` — existing error class                |
| `node()`, `typecheck()`, `docs()`, `react()`, etc.             | `@theholocron/holocron-config` — one file per capability |
| `nextjs()` bundle                                              | `@theholocron/holocron-config` — `configs/nextjs.ts`     |
| `monorepo()`                                                   | `@theholocron/holocron-config` — `configs/monorepo.ts`   |

The CLI owns the merge semantics; the config package owns the org-specific
values (account IDs, domains, check names).

---

## Migration path

1. Add `Capability`, `ComposedPreset`, and `compose()` to `@theholocron/cli`
2. Rewrite `holocron-config` presets as capability factories; keep existing
   `nodeDocs()` etc. as shims that call `compose()` internally (no consumer
   breakage)
3. Update `skills`, `themes`, and any new repos to use `compose()` directly
4. Deprecate and eventually remove the shim functions

---

## What this replaces

- `nodeDocsSite()` — never needs to exist; it's just `compose(node(), docs())`
- The `workflows.filter(…)` workaround in `skills/holocron.config.ts`
- Any future `nodeDocsMonorepo()`, `nodeReact()`, etc. variants
