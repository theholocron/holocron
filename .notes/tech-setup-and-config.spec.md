---
status: proposed # draft → proposed (issue filed) → approved (milestone attached) → archived
issue: 82
blocked-by: []
---

<!-- editorconfig-checker-disable-file -->

# Extend `holocron setup` — repo policy, branch protection, config ergonomics

> **Decision.** Broaden #82's scope beyond just "repo policy + branch
> protection" to also cover config ergonomics discovered during the
> alpha migration:
>
> - `project.repo` top-level config field so every plugin's context
>   gets `repo` without needing `--repo <owner/name>` on every
>   invocation OR duplicating it into each provider's options.
> - Capability-factory lazy-load pattern: factories construct with
>   whatever options they got; validation happens at method-call
>   time, so a partially-configured plugin doesn't block the entire
>   runtime at load time (already applied to
>   `packages/holocron-plugin-github/src/capabilities/issues.ts`).

## Context

Two discoveries during task #10 (this repo's 1P → Doppler vault
migration) exposed gaps in setup ergonomics:

1. **Every GitHub plugin invocation requires `--repo owner/name`.**
   The GitHub plugin's `createContext` throws at load time if
   `options.repo` is unset. `holocron.config.json`'s `providers`
   block is per-capability, so putting `{ repo: "..." }` on every
   github-backed capability entry (source, ci, secrets, environments,
   issues) is repetitive. The `--repo` flag is a per-invocation
   escape hatch, but for a self-hosted config repo like this one,
   forgetting the flag every time defeats the "self-hosted" ergonomics.

2. **A single missing option in one capability can block ALL commands
   from loading.** `holocron-plugin-github`'s `issues` factory used
   to throw at construction if `labels` was missing. Even for
   commands that never touch the issues capability (e.g., `holocron
setup`), the load-time error aborted the whole run.

Plus the ORIGINAL #82 scope — `holocron setup` doesn't yet touch
repo-level policy or branch protection, both of which belong in the
"provision infra for a project" flow.

## Design

### `project.repo` top-level config field

Add to `HolocronConfig`:

<!-- prettier-ignore -->
```jsonc
{
  "project": {
    "name": "holocron",
    "description": "...",
    "repo": "theholocron/holocron",  // NEW — "owner/name"
  },
  "providers": { ... }
}

```

Resolution + flow:

1. `loadConfig()` reads `project.repo` alongside the existing
   `project.name`/`description`.
2. `runSetup` / `runDoctor` / etc. inject `project.repo` into
   `RuntimeContext.repo` when building the context passed to the
   loader. `--repo <coord>` on the command line still overrides
   (it's per-invocation).
3. `PluginLoader.loadOne` already merges `context` into plugin
   options, so `options.repo` gets populated automatically.
4. Github plugin's `parseRepo` continues to be the last-line
   validator; nothing changes at the plugin level.

Existing repos that don't declare `project.repo` keep working via
the `--repo` flag path. Non-breaking.

### Capability-factory lazy-load pattern

**Rule**: plugin factories should NOT throw at construction time for
missing configuration that only affects a subset of their methods.
Validation happens at method-call time with a message that names the
specific option.

Applied so far to `GitHubIssues` (labels optional). Should also apply
to any future plugin where a capability has orthogonal options — e.g.:

- `holocron-plugin-1password`'s current `verifyOpInstalled` runs
  eagerly in `createContext`. Fine for now (1P is being deprecated —
  task #11), but new plugins should defer any subprocess spawns to
  method-call time.
- Any future auth plugin whose webhook features need extra config —
  don't gate the whole plugin on webhook config.

Codify this in `.claude/skills/holocron-plugin.md` under "Patterns
that are non-negotiable".

### Repo policy + branch protection setup (original #82 scope)

`runSetup` should call, after the existing source-security-toggles
block:

- `source.updateRepoSettings({ ...safe-defaults })` — squash-only,
  delete-branch-on-merge, no wiki, etc. Configurable in
  `holocron.config.json` under a new `sourceSettings` field?
- `source.createRuleset({ ... })` for branch protection on the
  default branch — required status checks, required review count,
  block force-push, block deletion. Idempotent via
  `listRulesets` → `updateRuleset`.

Both operations already exist on the `Source` interface
(`packages/cli/src/capabilities/index.ts`). Just needs orchestrator
wiring + a place to declare the policy shape.

Open question: does the policy shape live in the top-level config
(`project.repoPolicy`) or in the source plugin's options
(`providers.source: ["github", { policy: {...} }]`)? Leaning
top-level since it's provider-agnostic (GitLab et al. will need the
same concept).

### Environment slug convention (discovered during Infisical validation)

`runSetup` currently hardcodes `["dev", "stg", "prd"]` when calling
`vault.ensureEnvironment`. That matches Doppler's short-slug
convention, but Infisical ships `dev` / `staging` / `prod` as its
default environment slugs — running setup against Infisical would
create additional `stg` and `prd` envs alongside the existing
`staging` and `prod` (idempotent, not destructive, but noisy).

Fix options:

- **`project.environments`** top-level config field with the operator's
  chosen env slugs (`["dev", "staging", "prod"]` or whatever)
- **Per-vault-provider env name mapping** in plugin options (more
  scoped but pushes the concern into every vault plugin)

Leaning **`project.environments`** — same rationale as `project.repo`:
it's a project-wide concept, not a vault-specific one. The other
capabilities that iterate over environments (`environments.upsertEnvironment`
in the github plugin, currently hardcoded to `["staging", "production"]`)
should read the same field for consistency.

## Roadmap

- **Phase 1** (shipped): `project.repo` field added to
  `HolocronConfig`. `PluginLoader` merges it into every plugin's
  options as `context.repo` before the CLI `--repo` flag (which
  overrides), before per-plugin tuple options (which override
  both). This repo's `holocron.config.json` now declares
  `repo: "theholocron/holocron"` — `pnpm holocron setup` /
  `doctor` no longer need `--repo` on the command line.
- **Phase 2** (medium): Lazy-load pattern documented in the plugin
  skill + audited across existing plugins. Update the skill's
  "Patterns that are non-negotiable" section.
- **Phase 3** (shipped): `project.repoPolicy` field added to
  `HolocronConfig`. `runSetup` now calls `source.updateRepoSettings()`
  (squash-only, auto-merge, issues/discussions/projects on, wiki off,
  web sign-off, always-suggest-updating) and idempotently creates/
  updates a GitHub ruleset named `"holocron-default-branch"` (blocks
  force-push + deletion, requires a pull request, optional required
  status checks for `preset: "strict"`). Presets: `"balanced"` (default),
  `"strict"` (+ `requiredChecks`), `"none"` (skip). This repo's
  `holocron.config.json` now uses `preset: "strict"` with the four
  CI job names as required checks.

Phase 2 and 3 are independent quick wins that can ship separately.

## Open questions

1. **Should `project.repo` be REQUIRED?** Argument for: makes every
   github invocation clean. Argument against: not every project uses
   github (Rando ports Jira/Sentry adapters, etc.); some projects
   might use holocron without any source-capability plugin at all.
   Leaning **optional** — validate only when a source-capability
   plugin needs it.
2. **How aggressive should the default repo policy be?** Too strict
   → operators disable `holocron setup`. Too loose → the point of
   the feature is lost. Suggest opt-in via a `sourceSettings` field
   with a `preset` value (e.g., `"strict"` / `"balanced"` / `"none"`).
3. **Branch protection: rulesets vs classic branch protection?**
   Rulesets are the modern GitHub API; classic branch protection
   still works but is being deprecated. Go rulesets-only from day
   one to avoid dual-code-path maintenance.
