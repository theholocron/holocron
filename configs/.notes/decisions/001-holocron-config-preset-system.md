# ADR 001 — Holocron Config Preset System

**Status:** Proposed  
**Date:** 2026-08-28  
**Repo:** theholocron/configs

---

## Context

Every `theholocron/*` repository contains a `holocron.config.ts` that wires up the Holocron CLI: which workflows to sync, which providers to use, which branch protection checks to require. As the org has grown, these files have diverged in predictable ways:

- Every library/docs repo repeats the same `org`, `domain`, `docs`, and Cloudflare provider config with minor variations.
- Every browser app repo repeats the same Vercel provider, audit options, and test flags.
- Required checks lists are long, manually maintained, and drift when workflow jobs are renamed.
- The only shared abstraction is `node()`, which covers the lowest common denominator (source, CI, issues providers + base workflow list). Everything above that is copy-pasted.

When the deploy preview + cleanup workflow was added across six repos simultaneously, each `holocron.config.ts` had to be updated independently with identical additions. That manual sweep exposed the gap.

## Decision

Introduce a layered preset system in `@theholocron/holocron-config` and a companion **conclusion job pattern** in `theholocron/.github`.

### 1. Conclusion job pattern (in `.github`)

Add a `conclusion` job to each reusable workflow (`lint.yml`, `test.yml`, `typecheck.yml`, `audit.yml`). The job runs `if: always()`, depends on every other job, and fails if any sibling failed or was cancelled. Consuming repos then require `"Lint / Conclusion"` instead of individual job names.

This decouples branch protection from internal job structure — when a workflow gains or renames a job, no `requiredChecks` arrays need updating.

### 2. Preset hierarchy (in `holocron-config`)

```
node()          — base: providers, repo defaults, core workflows
  └─ nodeDocs() — adds: org, domain, docs, cloudflare, deploy+preview workflow
nextjs()        — browser app: vercel, audit, test flags, storybook, common checks
react()         — browser app: same minus vercel + user-flow
monorepo(base)  — extension: wraps any preset, overrides for workspace repos
```

Each preset returns a `HolocronPreset` fragment (providers, repo defaults, workflows). Consuming repos spread the preset into `defineConfig()` and add only the fields that are unique to that repo: `description`, `homepage`, `topics`, `requiredChecks` extensions, package-specific codecov components, and test/chromatic specifics.

### 3. Required checks strategy

Presets include only **stable, cross-repo** checks:

```
"Lint / Conclusion"
"Test / Conclusion"
"Typecheck / Conclusion"
"audit / Conclusion"
"codecov/patch"
"codecov/project"
```

Per-repo `requiredChecks` arrays extend the preset with repo-specific entries — primarily `codecov/patch/<package>` and `codecov/project/<package>` components unique to that repo's package structure.

## Consequences

**Positive**

- A new org-wide CI change (e.g., adding a deploy preview workflow) requires editing the preset once, not every repo.
- `requiredChecks` arrays shrink from 15–20 entries to 5–8 stable entries plus per-repo package components.
- Branch protection is insulated from internal workflow job renames.
- The preset hierarchy documents the org's repo taxonomy explicitly.

**Negative**

- Adding a new preset requires a release of `@theholocron/holocron-config` before consuming repos can adopt it — two-PR chains per change.
- `codecov/patch` at the repo level does not guarantee individual component thresholds are met; per-component entries in each repo are still needed for component-level enforcement.
- The `monorepo()` extension pattern (function-wrapping rather than standalone preset) is less discoverable than a named preset.

**Neutral**

- Existing `node()` usage is unchanged; adoption of the new presets is repo-by-repo.
- Template repos are excluded from the node/docs presets since they have divergent testing setups.
