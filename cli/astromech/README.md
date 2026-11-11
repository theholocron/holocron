# `@theholocron/astromech`

The Holocron task runner. One **task manifest** per repo, and every
derived surface comes from it: `holocron run` (local), `holocron run ci` (the
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

const report = astromech.run("test:unit", { passthrough: ["--watch"] });
// → { status: "ok" | "fail" | "skip" | "dry-run" | "unknown", command?, message? }
```

### `holocron run <task>` resolution

`holocron run test:unit` runs your unit tests, `holocron run test` the whole `test` suite — you don't tell it
turbo vs pnpm vs npm, or which runner. The words are joined with `:` and the longest match against the registry wins
(`test unit` is `test:unit`, `deploy preview` is `deploy-preview`); what is left is the `[job]` argument. A suite
(`test`, `lint`, `scan`) is declared by the `suite` field of its leaves in the registry and runs the leaves the repo's
`tasks:` lists, in registry order; `format` is its own verb (prettier only; writes, `--check` reads). The old dotted
names (`LEGACY_NAMES`) are accepted in `tasks:` and by `run`, with a deprecation notice on stderr:

```text
1. turbo.json defines the task            → turbo run <task>
2. package.json has a <task> script       → <detected pm> run <task>
   (a "holocron run …" thin caller is skipped — no recursion; so is the root script generated from the
   registry's own command, which step 3 runs itself)
3. the registry has a local runner        → <tool> <args>   (`test:unit` is `vitest run --coverage`)
3b. the task is a linterGroup             → each resolved linter, run natively
4. known task, nothing to run             → "no <task> task", exit 0  (exit 1 with --required)
5. unknown task                           → error, exit 1
```

## Intent → technology

Tasks are named by **intent**, not by tool — a repo declares
`test:unit`, not `vitest`. (The dotted names such as `verification.unitTests` are the old spelling; they still <!-- holocron-allow-old-name -->
work as aliases, see `LEGACY_NAMES`, but nothing generated uses them for a repo on flat ids.)
The table below is the full
registry (`TASKS` in `src/registry/registry.ts`): every task name astromech knows,
what it actually runs, and why. Tool names never appear in
`holocron.config.ts` — they're an implementation detail this table
documents, not a naming convention repos need to follow.

| Task                                 | Runs                                                                                                                                                             | Notes                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `test:unit`                          | vitest                                                                                                                                                           | always runs with coverage: `vitest run --coverage`, there is no flag                                         |
| `typecheck`                          | tsc                                                                                                                                                              | `tsc --noEmit`                                                                                               |
| `test:perf`                          | Lighthouse CI                                                                                                                                                    | only runs with a `lighthouse.config.*` present                                                               |
| `lint:code`                          | eslint, actionlint, git-merge-conflict-markers                                                                                                                   | a `linterGroup` — see below                                                                                  |
| `lint:editorconfig`, `lint:markdown` | editorconfig-checker, markdownlint-cli2                                                                                                                          | each is a `linterGroup` of one tool                                                                          |
| `format`                             | prettier                                                                                                                                                         | writes by default, `--check` is read-only; no workflow of its own                                            |
| `lint:data`                          | yamllint                                                                                                                                                         |                                                                                                              |
| `lint:unused`                        | knip                                                                                                                                                             |                                                                                                              |
| `scan:secrets`                       | gitleaks                                                                                                                                                         |                                                                                                              |
| `scan:code`                          | CodeQL                                                                                                                                                           | no local equivalent — CI only                                                                                |
| `check-tokens`                       | `holocron doctor tokens`                                                                                                                                         | scheduled daily in CI; fails on a rejected token or one with 7 days or fewer left; never part of `run ci`    |
| `build`                              | tsdown / vite / rollup / tsc, detected from the repo's own config file, or `package.json`'s own `dependencies`/`devDependencies` if that config file isn't there |                                                                                                              |
| `release`                            | semantic-release                                                                                                                                                 | no local equivalent — CI only; carries `preview` (npm dist-tags)                                             |
| `deploy`                             | Cloudflare Pages / Vercel                                                                                                                                        | no local equivalent — CI only; carries `preview`                                                             |
| `measure:bundle`                     | bundle-size upload to Codecov                                                                                                                                    | no local equivalent — CI only                                                                                |
| `check-preview`                      | `holocron check monitor <url>` against the PR's own Vercel preview URL                                                                                           | no local equivalent — CI only; triggered by `deployment_status`, not `push`/`pull_request`                   |
| `check-notify`                       | _(none — manual workflow)_                                                                                                                                       | posts a labelled test message to every notification channel; fails per channel that does not work            |
| `sync-repo`                          | `holocron sync`                                                                                                                                                  | keeps generated files current                                                                                |
| `lint:commits`                       | commitlint                                                                                                                                                       | no local equivalent — enforced by the `commit-msg` hook locally, over the PR's commit range in CI            |
| `validate:specs`                     | `holocron probe specs check`                                                                                                                                     | spec/ADR frontmatter — a leaf of the `validate` suite, not a linter                                          |
| `validate:docs`                      | `holocron probe docs validate`                                                                                                                                   | docs presence (warns) and token docs (fails) — a leaf of the `validate` suite, not a linter                  |
| `validate:deps`                      | `holocron probe deps check`                                                                                                                                      | dependency catalogs — a leaf of the `validate` suite, not a linter                                           |
| `validate:generated`                 | `holocron probe generated check`                                                                                                                                 | generated files match the config — a leaf of the `validate` suite, not a linter                              |
| `measure:docs`                       | `holocron probe docs coverage`                                                                                                                                   | doc-comment coverage, uploaded to Codecov as the `documentation` flag; the Codecov status gates, not the job |
| `remind-doctor`                      | _(none — posts through a webhook secret)_                                                                                                                        | a weekly #alerts line that reminds a maintainer to run `doctor notifications --post`                         |
| `publish-wiki`                       | Fern                                                                                                                                                             | publishes `docs/wiki/*.md` — not a sync, a publish; carries `preview`                                        |
| `deploy-docs`                        | Astro build                                                                                                                                                      | the docs site itself; carries `preview` (defaults on)                                                        |
| `deploy-components`                  | Storybook build                                                                                                                                                  | a browsable component catalog — "Storybook" is the tool, not the intent; carries `preview` (defaults on)     |

**`preview` is a cross-cutting feature, not a namespace.** npm has staging
dist-tags, Cloudflare/Vercel do per-PR preview deploys, Fern previews
docs — none of these earn their own task or verb; it's one capability any
publish/deploy-shaped task can carry, toggled via that task's `with:`.

**`linterGroup` tasks** (`lint:code`) bundle more than one tool under a single
required check. Each tool is still gated by its own detection rule — e.g.
`eslint` runs when either a local `eslint.config.*` is present, or the
package has no local file but `@theholocron/eslint-config` resolves
(the same shared-config splice the `tool`/`detect` runner path uses) — the
`tool name → detection rule → local binary` mapping lives in one place,
`src/tasks/run/linters/linters.ts`. A repo's choice of which of these run is based on which
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
    "typecheck",
    { name: "test:unit", required: true, with: { "run-coverage": true } },
    { name: "scan:code", ci: true, local: false }, // CI-only
  ],
});
```

`loadTasksConfig(cwd)` resolves the manifest: the `tasks` key of
`holocron.config.*` (a bare item array), then a dedicated
`astromech.config.*` merged on top (dedicated wins; arrays concatenate).
`mergeTasksLayers(parentTasks, dedicated)` is that merge step on its own,
for callers that load the two sources some other way (Sentinel reads them
through the GitHub API).

| `TaskEntry` field        | Effect                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `ci` (default `true`)    | emit the CI workflow; include in `holocron run ci`          |
| `local` (default `true`) | write the `package.json` script; `holocron run` resolves it |
| `local: false`           | `holocron run <name>` → "CI-only task", exit 0              |
| `required`               | the task's check context is a required status check         |
| `with`                   | per-repo overrides on the reusable-workflow channel         |

Top-level keys: `syncScripts: false` disables the `package.json` script
writes entirely; `holocronScript` sets the command the synced `"holocron"`
script runs (default `"holocron"`) and the one the generated git hooks call.

### Generated surfaces

```ts
const astromech = createAstromech({ cwd, config, orgContext: { org, domain } });

astromech.thinCallers(); // Map<"<name>.yml", yaml>  — one per templated, ci-enabled task
astromech.packageScripts(); // single package: { holocron: "holocron", "test:unit": "holocron run test unit --", … }; workspace: { "test:unit": "turbo run test:unit", … }
astromech.requiredChecks(true); // ["ci / Required checks", "DCO"]  — branch-protection contexts (false: "DCO", then the per-task contexts, then extras)
astromech.aggregateCaller(); // the thin caller of the `ci` aggregate check, or null when nothing is required
astromech.codecovConfig(existing); // codecov.yml content — merges into `existing`, or scaffolds fresh when null
astromech.ci({ scope: "required" }); // CiReport — run the gating checks locally, in CI order
```

`ci()` runs every `required: true` task (else every `ci: true` task) through
the same resolution as `run()`, in `CI_ORDER`, and returns `{ status, jobs }`.
A `required` task whose local runner can't run is a failure — **except** a
task that's genuinely CI-only (`local: null`, or a `linterGroup` whose every
member lacks a local binary entirely, like `lint:commits`),
which is reported skipped even when required. `holocron run ci` sets the
process exit code from `status`.

`thinCallers()` returns the raw `.github/workflows/*.yml` content (no
generated-by header — the caller prefixes its own). `deploy` /
`deploy-docs` / `deploy-components` with `preview:` produce the
combined push-to-Pages / PR-to-preview workflow —
`deploy-docs`/`deploy-components` default `preview` on, since
neither has a plain-production-only fallback template.
`packageScripts()` emits the `holocron` entry (`holocronScript ?? "holocron"`)
plus the scripts `scriptsFor(config, registry, { monorepo })` computes; it skips
`local: false` entries and tasks with no local runner at all, and returns
`{}` when `syncScripts: false` or there is no config. The same function backs `sync`, which merges the result with
`mergeScripts()`, and `probe generated check`, which fails on a root script that differs and on a script that breaks the
rules of `checkPackageScripts()`.

#### Scripts and `turbo.json`

`scriptsFor()` is the one rule for what a root script calls (spec `ci-flat-task-vocabulary`):

| Repo                                           | Package-scoped leaf (`build`, `test:unit`) | Repo-scoped leaf (`lint:markdown`, `format`)  | Suite (`test`, `lint`)    |
| ---------------------------------------------- | ------------------------------------------ | --------------------------------------------- | ------------------------- |
| a pnpm workspace with a generated `turbo.json` | `turbo run <key>`                          | the tool's own command (`prettier --write .`) | `turbo run <suite>`       |
| a single package                               | `holocron run <words> --`                  | `holocron run <words> --`                     | `holocron run <suite> --` |

A leaf with no local command (`scan:code`, `lint:commits`, `release`, a holocron subcommand) has no script in a
workspace. `holocron` may not be built on a fresh clone while turbo is an ordinary devDependency, which is why a
workspace calls turbo directly. In a workspace `turboConfig()` also writes each suite as a task with no script that
`dependsOn` its leaves, and a `//#<id>` root task (`cache: false`, since it reads every package's files) for each
repo-scoped leaf that belongs to a suite, which is how a suite reaches the root tool. A package's own leaf script holds the
real tool command and never calls turbo or `holocron run`, and no package carries a script named like a suite.

The key a package-scoped leaf has in `turbo.json`, and so the name of its script in every package, **follows how the
manifest spells the task**: `{ name: "test:unit" }` gives `test:unit`, `{ name: "test:unit" }` keeps
`test:unit`. A repo's packages hold scripts in the vocabulary its `tasks:` list speaks, so rewriting the list
to flat ids is what moves its keys, and the package scripts with them (`taskKey()`).

### Required checks

`requiredChecks(aggregate)` is the branch-protection required-status-check list. With the `ci` aggregate (the repo
contains it, see below) it is `["ci / Required checks", "DCO"]`. Without it, it is `"DCO"`, then every `{ required: true }` task's check
context, ordered by `CI_ORDER`, then `config.extraRequiredChecks` (codecov gates, …), de-duplicated. Most tasks are
single always-run jobs now, so their context
names that job directly (`"typecheck / Run tsc --noEmit"`) — the `… /
Conclusion` fan-in job inside a workflow is only used where a task genuinely has
several conditionally-run jobs feeding one check
(`test:unit`). `holocron repo setup`
applies the list for `protection: "strict"` repos. Policy-free — manifest only.

### The `ci` aggregate

`aggregateChecks(config)` derives what the reusable `ci.yml` (in `ci/workflows/`) waits on, from the same list: the
`expected` ids are the part before `/` of each required task's context and of each `extraRequiredChecks` entry that
is not a `codecov/` status (the hand-written `Generated files / Check` becomes `Generated files`), and `statuses` are
the `codecov/` entries. `aggregateCaller()` renders the `pull_request` caller, whose job `ci` calls the reusable's `Required checks` job.
`holocron sync` writes it only in the repo that contains the reusables. The ids are today's check names; the later
rename changes them here and costs no ruleset edit.

### `codecov.yml`

`codecovConfig(existing)` generates this repo's `codecov.yml` — component
`paths` derived from `packages/*` **and** `apps/*` (monorepo templates ship
user-facing code under `apps/` alongside library code under `packages/`;
`readWorkspacePackages()` scans both and tags each result with the `dir` it
came from), same manifest-derived category as `thinCallers()`. Pass the
current file's content (or `null`) and it either merges the
`individual_components` list in (preserving everything else in the file —
thresholds, flags, custom rules) or scaffolds a fresh file from the base
template. `holocron repo setup` writes the result via the `source` capability;
this method never touches the filesystem beyond reading `packages/*` and
`apps/*` under `cwd`.

## Release-time deploys — `deployOnRelease`

Deploys the workspace packages whose manifest declares it (holocron#930):

```ts
// packages/<app>/holocron.config.ts
tasks: [{ name: "deploy", with: { on: "release", channel: "alpha" } }];
```

`holocron deploy on-release --channel=<alpha|main> --from=<previous release commit> --to=<release commit>`
(or `deployOnRelease()` from `@theholocron/astromech`) deploys each such package
when the release is on its `channel` (default `main`, the stable release;
set `alpha` for prereleases) and changes the package or one of its `workspace:*` dependencies
(`with.paths` overrides that), once npm serves the release's new dependency
versions, by running `pnpm --filter <package> deploy`. A package
that doesn't apply to the release is skipped; a deploy that fails exits
non-zero. The shared `release` workflow runs it as a separate `deploy`
job after the release job (opt in with `deploy-on-release: true`), so a deploy
is its own re-runnable check. A `deploy` task with `on: "release"`
generates no workflow.

## Development

| Script               | Description                                 |
| -------------------- | ------------------------------------------- |
| `pnpm run build`     | Bundle with tsdown                          |
| `pnpm run test:unit` | Run the vitest suite (always with coverage) |
| `pnpm run typecheck` | `tsc --noEmit`                              |
| `pnpm run lint:code` | ESLint                                      |

## Releases

Automated via semantic-release. See [CHANGELOG.md](../../CHANGELOG.md).

## Documentation

<https://docs.theholocron.dev/holocron/>

## Lint — `@theholocron/astromech/lint`

The lint tools' own data and checks, in a subpath so the runner and the
config surface don't pull `@commitlint/*` in:

- `lintCommitMsgFile(file, cwd)` / `lintCommitMessage(message, config)` —
  what `holocron run lint commit-msg <file>` (the `commit-msg` hook) runs.
- `ALEX_CONFIG`, `ALEX_IGNORE_PATTERNS`, `PRETTIER_IGNORE_PATTERNS`,
  `EDITORCONFIG_CHECKER_EXCLUDE` and `isEditorConfigExcluded(path)` — read
  from the same templates `holocron repo setup` writes, so Sentinel's central
  checks skip exactly what each repo's own CI skips.

The root entry also exports the config-file generators `holocron repo setup`
writes (`createEditorconfig`, `createAlexrc`, `createPrePush`, …) and
`createHeader`.

## Repo validation — `@theholocron/astromech/repo-validation`

The rules of the `validate:specs` and `validate:docs` checks, once, as pure functions over plain data (changed files, commit
subjects, the PR description, a manifest) that return findings. They do no git, no filesystem and no network, so the two
interfaces that run them only supply the data: the CLI (`holocron probe docs presence` and `holocron probe specs check`, the two leaves of
the `validate` suite) from git and the filesystem, and [Sentinel](https://docs.theholocron.dev/holocron/sentinel/) from the
webhook and the GitHub API (#929).

- Docs presence: `isFeat(subjects)`, `packageOf(file, readPackage)`, `pageNames(dir)`, `hasDocsSignal(dir, changedFiles, addedCommentLines)`,
  `isAddedDocComment(line)`, `parseSkipDocs(text)` (the `[skip docs] <reason>` marker) and
  `evaluateDocsPresence({ packages, changedFiles, addedCommentLines, skip })`, which sorts a feature's packages into
  those to warn about and those a marker excused.
- ADRs and specs: `checkSpecs(files)` takes `{ path, text }` pairs and returns `{ fileCount, findings }`, skipping a path that
  is neither an ADR nor a spec; underneath it are `classifySpecPath(path)`, `parseFrontmatter(text)`,
  `validateAdr(path, text)`, `validateSpec(path, text)` and `isValidIsoDate(value)`, and the folders and status sets
  (`ADR_DIR`, `SPEC_DIRS`, `ADR_STATUSES`, `SPEC_STATUSES`). A `SpecFinding` is an `error` (fails the check) or a
  `warning` (never does), with the file, the field's line and the rule.

## Upgrade — `@theholocron/astromech/upgrade`

The repo-agnostic machinery behind `holocron repo upgrade`, in a subpath so the CLI and any other tool can use it.

- `runUpgradeNode({ to, from?, cwd?, dryRun?, extra?, logger? })` walks the repo and rewrites every Node.js major pin:
  `engines.node`, an exact `@types/node`, `.nvmrc`, `.node-version`, workflow `node-version:`, Dockerfile
  `FROM node:` and `.tool-versions`. `from` is read from `.nvmrc` or `engines.node` when omitted. It never throws:
  a failure is `{ status: "fail", message }`. Underneath are `patchPackageJson`, `patchYaml`, `patchPinFile`,
  `patchDockerfile`, `patchToolVersions` and `detectNodeMajor`.
- `fetchLatestFromNpm(pkg)` resolves a package's `latest` dist-tag from the npm registry, or `null` on any failure.

What counts as a Holocron pin (`@theholocron/*`) and the `holocron.config.ts` migration stay in `@theholocron/cli`.
