# `@theholocron/astromech`

The Holocron task runner. One **task manifest** per repo, and every
derived surface comes from it: `holocron run` (local), `holocron ci` (the
CI suite run locally), the generated GitHub Actions workflows, the
`package.json` scripts, and the branch-protection required-checks list.

> An astromech droid runs a starfighter's maintenance, diagnostics and
> system wiring while the pilot flies. This does that for a repo.

A plain library — **not** a capability plugin. `@theholocron/cli` depends
on it and instantiates it once.

## Installation

```sh
pnpm add @theholocron/astromech
```

## Usage

```ts
import { createAstromech } from "@theholocron/astromech";

const astromech = createAstromech({ cwd });

const report = astromech.run("verification.unitTests", { passthrough: ["--watch"] });
// → { status: "ok" | "fail" | "skip" | "dry-run" | "unknown", command?, message? }
```

### `holocron run <task>` resolution

`holocron run verification.unitTests` runs your tests — you don't tell it
turbo vs pnpm vs npm, or which runner:

```
1. turbo.json defines the task            → turbo run <task>
2. package.json has a <task> script       → <detected pm> run <task>
   (a "holocron run …" thin caller is skipped — no recursion)
3. the registry has a local runner        → <tool> <args> <org-flags>   (e.g. --coverage)
3b. the task is a linterGroup             → each resolved linter, run natively
4. the task is a container of jobs        → each job, in declared order
5. known task, nothing to run             → "no <task> task", exit 0  (exit 1 with --required)
6. unknown task                           → error, exit 1
```

## Intent → technology

Tasks are named by **intent**, not by tool — a repo declares
`verification.unitTests`, not `vitest`. The table below is the full
registry (`TASKS` in `src/registry.ts`): every task name astromech knows,
what it actually runs, and why. Tool names never appear in
`holocron.config.ts` — they're an implementation detail this table
documents, not a naming convention repos need to follow.

| Task | Runs | Notes |
| --- | --- | --- |
| `verification.unitTests` | vitest | carries the `--coverage` org default |
| `verification.typeSafety` | tsc | `tsc --noEmit` |
| `verification.performance` | Lighthouse CI | only runs with a `lighthouse.config.*` present |
| `sourceQuality.staticAnalysis` | eslint, actionlint, git-merge-conflict-markers | a `linterGroup` — see below |
| `sourceQuality.formatting` | prettier, editorconfig-checker, markdownlint-cli2 | a `linterGroup` |
| `sourceQuality.structuredDataValidation` | yamllint | |
| `sourceQuality.deadCodeAnalysis` | knip | |
| `security.secretDetection` | gitleaks | |
| `security.codeScanning` | CodeQL | no local equivalent — CI only |
| `security.dependencyReview` | GitHub's native Dependabot alerts/graph | a capability-model method (`Source.enableVulnerabilityAlerts()`), not a task |
| `delivery.build` | tsdown / vite / rollup / tsc, detected from the repo's own config file | |
| `delivery.publish` | semantic-release | no local equivalent — CI only; carries `preview` (npm dist-tags) |
| `delivery.deploy` | Cloudflare Pages / Vercel | no local equivalent — CI only; carries `preview` |
| `delivery.bundleSize` | bundle-size upload to Codecov | no local equivalent — CI only |
| `platform.repoSync` | `holocron sync` | keeps generated files current |
| `platform.commitStandards` | commitlint | no local equivalent — enforced by the `commit-msg` hook locally, over the PR's commit range in CI |
| `platform.repoValidation` | `scripts/validate-adrs.mjs`, `scripts/validate-registry.mjs` | a job-bearing task — spec/ADR frontmatter and registry-doc completeness, not linters |
| `knowledge.wiki` | Fern | publishes `docs/wiki/*.md` — not a sync, a publish; carries `preview` |
| `knowledge.docs` | Astro build | the docs site itself; carries `preview` (defaults on) |
| `knowledge.components` | Storybook build | a browsable component catalog — "Storybook" is the tool, not the intent; carries `preview` (defaults on) |

**`preview` is a cross-cutting feature, not a namespace.** npm has staging
dist-tags, Cloudflare/Vercel do per-PR preview deploys, Fern previews
docs — none of these earn their own task or verb; it's one capability any
publish/deploy-shaped task can carry, toggled via that task's `with:`.

**`linterGroup` tasks** (`sourceQuality.staticAnalysis`,
`sourceQuality.formatting`) bundle more than one tool under a single
required check. Each tool is still gated by its own detection rule (e.g.
`eslint` only runs if `eslint.config.*` is present) — the
`tool name → detection rule → local binary` mapping lives in one place,
`src/linters.ts`. A repo's choice of which of these run is just which
tasks it includes in `tasks: [...]`, same as any other task.

**No super-linter.** Each task above runs its own tool directly, through
the same `holocron` composite action that resolves it locally — CI runs
the identical command a developer runs, not a third-party action bundling
a tool version this org doesn't control.

## Config — `@theholocron/astromech/config`

The config surface lives in a zero-runtime-dep subpath so
`astromech.config.ts` and `@theholocron/cli` import it without pulling
the runner.

```ts
// astromech.config.ts
import { defineConfig } from "@theholocron/astromech/config";

export default defineConfig({
  tasks: [
    "verification.typeSafety",
    { name: "verification.unitTests", required: true, with: { "run-coverage": true } },
    { name: "security.codeScanning", ci: true, local: false }, // CI-only
  ],
});
```

`loadTasksConfig(cwd)` resolves the manifest: the `tasks` key of
`holocron.config.*` (a bare item array), then a dedicated
`astromech.config.*` merged on top (dedicated wins; arrays concatenate).

| `TaskEntry` field        | Effect                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `ci` (default `true`)    | emit the CI workflow; include in `holocron ci`              |
| `local` (default `true`) | write the `package.json` script; `holocron run` resolves it |
| `local: false`           | `holocron run <name>` → "CI-only task", exit 0              |
| `required`               | the task's check context is a required status check         |
| `with`                   | per-repo overrides on the reusable-workflow channel          |

Top-level keys: `syncScripts: false` disables the `package.json` script
writes entirely; `holocronScript` sets the command the synced `"holocron"`
script runs (default `"holocron"`).

### Generated surfaces

```ts
const astromech = createAstromech({ cwd, config, orgContext: { org, domain } });

astromech.thinCallers(); // Map<"<name>.yml", yaml>  — one per templated, ci-enabled task
astromech.packageScripts(); // { holocron: "holocron", "verification.unitTests": "holocron run verification.unitTests", … }
astromech.requiredChecks(); // ["Typecheck / tsc --noEmit", "codecov/patch", …]  — branch-protection contexts
astromech.codecovConfig(existing); // codecov.yml content — merges into `existing`, or scaffolds fresh when null
astromech.ci({ scope: "required" }); // CiReport — run the gating checks locally, in CI order
```

`ci()` runs every `required: true` task (else every `ci: true` task) through
the same resolution as `run()`, in `CI_ORDER`, and returns `{ status, jobs }`.
A `required` task whose local runner can't run is a failure — **except** a
task that's genuinely CI-only (`local: null`, or a `linterGroup` whose every
member lacks a local binary entirely, like `platform.commitStandards`),
which is reported skipped even when required. `holocron ci` sets the
process exit code from `status`.

`thinCallers()` returns the raw `.github/workflows/*.yml` content (no
generated-by header — the caller prefixes its own). `delivery.deploy` /
`knowledge.docs` / `knowledge.components` with `preview:` produce the
combined push-to-Pages / PR-to-preview workflow —
`knowledge.docs`/`knowledge.components` default `preview` on, since
neither has a plain-production-only fallback template.
`packageScripts()` emits the `holocron` entry (`holocronScript ?? "holocron"`)
plus one `"<task>": "holocron run <task>"` per runnable task; it skips
`local: false` entries and tasks with no local runner at all, and returns
`{}` when `syncScripts: false` or there is no config.

### Required checks

`requiredChecks()` derives the branch-protection required-status-check list
from the manifest: every `{ required: true }` task's check context, ordered
by `CI_ORDER`, then `config.extraRequiredChecks` (codecov gates, …),
de-duplicated. Most tasks are single always-run jobs now, so their context
names that job directly (`"Typecheck / tsc --noEmit"`) — the `… /
Conclusion` fan-in aggregate is only used where a task genuinely has
several conditionally-run jobs feeding one check
(`verification.unitTests`, `platform.repoValidation`). `holocron setup`
prepends `"DCO"` and applies the list for `protection: "strict"` repos.
Policy-free — manifest only.

### `codecov.yml`

`codecovConfig(existing)` generates this repo's `codecov.yml` — component
`paths` derived from `packages/*` **and** `apps/*` (monorepo templates ship
user-facing code under `apps/` alongside library code under `packages/`;
`readWorkspacePackages()` scans both and tags each result with the `dir` it
came from), same manifest-derived category as `thinCallers()`. Pass the
current file's content (or `null`) and it either merges the
`individual_components` list in (preserving everything else in the file —
thresholds, flags, custom rules) or scaffolds a fresh file from the base
template. `holocron setup` writes the result via the `source` capability;
this method never touches the filesystem beyond reading `packages/*` and
`apps/*` under `cwd`.

## Development

| Script                              | Description             |
| ------------------------------------ | ------------------------ |
| `pnpm run delivery.build`            | Bundle with tsdown        |
| `pnpm run verification.unitTests`    | Run the vitest suite      |
| `pnpm test:coverage`                 | Run tests with coverage   |
| `pnpm run verification.typeSafety`   | `tsc --noEmit`            |
| `pnpm run sourceQuality.staticAnalysis` | ESLint                 |

## Releases

Automated via semantic-release. See [CHANGELOG.md](../../CHANGELOG.md).

## Documentation

<https://theholocron.github.io/holocron/>
