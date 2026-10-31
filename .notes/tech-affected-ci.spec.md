---
status: draft
issue: theholocron/holocron#1202
blocked-by: []
related:
  - theholocron/holocron#1200
  - theholocron/holocron#1232
  - theholocron/holocron#1250
  - theholocron/holocron#1242
  - theholocron/holocron#1215
  - theholocron/holocron#1216
  - theholocron/holocron#672
---

# Affected-only CI with Turborepo and Codecov flags

> Epic #1200. Detail for the "Core requirement" section of `tech-monorepo-consolidation.spec.md` (ADR-0009, spec #672 D9). Measured 2026-10-29 on `alpha` @ `e95008ef5`, Node 22.23.3, turbo 2.10.12, 76 workspace packages. Commands are in "Evidence".

## Problem

CI work is not proportional to the change. Every PR runs every job over every package, even a README edit.

- Nothing passes `--affected`. `holocron run` forwards only `--filter` to turbo (`cli/astromech/src/tasks/run/run.ts`, step 1); the `holocron` composite action puts `args` after `--`. Static analysis, formatting, gitleaks, commitlint and repo validation already check out with `fetch-depth: 0`; unit tests, typecheck, build, dead code and bundle size use depth 1 (log: `fetch-depth: 1`).
- The generated `turbo.json` (`cli/astromech/src/generators/turbo/turbo.ts`) has `globalDependencies: [pnpm-workspace.yaml, tsconfig.json]` and unit-test inputs without `test/**`.
- **The "already wired" Vercel remote cache does not work.** The latest unit-test job logs `Remote caching unavailable` and `HTTP status client error (402 Payment Required)` from `vercel.com/api/v8/artifacts`; `TURBO_TEAM` is the personal scope `iamnewton` (`holocron.config.ts:43`). Only the `.turbo` `actions/cache` step helps.
- **That cache is restored too late.** In `reusable/actions/setup.yml` the "Build the Holocron CLI" step (`pnpm build`, 72 tasks, 0 cached, ~84 s in the job log) runs before "Cache Turbo artifacts". Every job in every PR pays this cold build.
- **The dependency graph defeats "affected".** 48 of 76 packages have the whole workspace as their dependent closure, because 36 packages declare `@theholocron/cli: workspace:*` and `cli` depends on the utils, clients, observability and astromech. Changing `utils/env-utils` selects all 76 packages. Only 27 packages (and `netlify-client`, closure 2) are true leaves. The #1202 acceptance line "a PR touching `utils/env-utils` skips unrelated folders" is not reachable without changing the graph (Q1).

## Goals and non-goals

Goals: a README-only PR does no package work and all required checks post green; a PR touching a leaf package runs that package (plus dependents) only; a second run of the same commit is a full cache hit; Codecov keeps the aggregate checks correct while uploading only affected folders.

Non-goals: `paths:` filters (a skipped required check blocks merge, spec #672 incident 2); per-package required checks; moving workflows into this repo (#1215/#1216, only referenced for rollout); release and docs-deploy affected logic (separate); #1242 beyond the shared generator file.

## Measured current state

| Check                                                | Observation                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Leaf `src` change (`utils/array-utils`)              | `--affected` selects 1 package, 4 tasks (its build, deps' builds, its tests). It has no dependents.                                                                |
| README-only change in the same package               | Package is still "affected" (selection is by changed file, not by task inputs), but `verification.unitTests` is a cache hit: inputs are scoped. Net: no real work. |
| Dependents                                           | Included (turbo walks reverse deps). `env-utils` selects 76/76 (see Problem).                                                                                      |
| `turbo.json` change                                  | All 76 packages (152 tasks).                                                                                                                                       |
| Workflow file change (`.github/workflows/stale.yml`) | 0 packages. Not in `globalDependencies`.                                                                                                                           |
| `pnpm-lock.yaml` whitespace change                   | 0 packages. A synthetic one-importer version edit also selected 0. Turbo's lockfile awareness is not proven on a real bump; Phase 1 must test one.                 |
| Nothing changed                                      | `Tasks: 0`, `No tasks were executed`, exit 0, 58 ms.                                                                                                               |
| Unknown base                                         | `Unable to query SCM`, non-zero exit: it fails closed, which is good.                                                                                              |
| Second run, same commit                              | `4 cached, 4 total >>> FULL TURBO`, 60 ms (local cache).                                                                                                           |

Required checks of ruleset `holocron-default-branch` (target `~DEFAULT_BRANCH` = `alpha`): `Typecheck / Run tsc --noEmit`, `Static Analysis / Run eslint and actionlint`, `Formatting / Run prettier, editorconfig-checker, markdownlint`, `Structured Data Validation / Run yamllint`, `Secret Detection / Run gitleaks`, `Commit Standards / Run commitlint`, `Repo Validation / Conclusion`, `Test / Conclusion`, `Build / Build every workspace`, `Dead Code Analysis / Run knip`, `Audit the Bundle Size / Upload bundle stats to Codecov`, `codecov/patch`, `codecov/project`. Matching is by string, so job names must not change.

Time (median of the last 30 successful PR runs per workflow, wall time): unit tests 334 s, typecheck 217 s, static analysis 208 s, formatting 151 s, repo validation 136 s, bundle size 124 s, dead code 122 s, secret detection 122 s, commit standards 121 s, yamllint 122 s, build about 115 s (one sampled run; the workflow triggers on push). About 29 runner-minutes per PR. Inside a unit job: setup 104 s, tests 200 s, uploads 9 s.

## Design

### 1. Generated `turbo.json` (#1202)

Generator change only; the file stays generated and never hand-edited.

- `globalDependencies`: `pnpm-workspace.yaml`, `tsconfig.json`, `holocron.config.*` and `astromech.config.*` (they define the tasks, and Codecov counts them as testable files, so a PR that touches only them must produce a report). `turbo.json` is implicit. **Not** the lockfile: turbo compares it per package, so a dependency bump invalidates only the packages whose resolved dependencies changed; listing it would make every bump a full run. **Not** the root `eslint`/`prettier`/`knip`/`tsdown` configs either: ESLint and tsdown already list theirs as `$TURBO_ROOT$` inputs of their own tasks, and prettier and knip are not turbo tasks. Workflow files are deliberately NOT global: a workflow edit is validated by actionlint/yamllint and by its own run, and making it global would turn every CI tweak into a full run (Q4, settled).
- Unit tests `inputs`: `src/**`, `test/**`, `vitest.config.*`, `package.json`, `$TURBO_ROOT$` vitest root config. `typeSafety` adds `test/**`. `outputs` unchanged, plus `coverage/**` stays (it feeds Codecov).
- `dependsOn: ["^delivery.build"]` stays; no new task edges.
- Root `//#` tasks for the non-turbo repo checks are a follow-up (Phase 6, optional): they have no per-package shape (gitleaks, yamllint, editorconfig-checker, knip, prettier).

### 2. `holocron run --affected` (#1232)

- `RunTaskInput` gains `affected?: boolean` and `base?: string`; yargs gets `--affected` and `--base <ref>`; the `holocron` composite action gets an `affected` input (`"true"`/`"false"`, default `"false"`) and passes `--affected` before `--`, so existing callers are unchanged.
- At a turbo root, `affected` appends `--affected` to `turbo run`; a `--filter` plus `--affected` combine as turbo defines. Without a `turbo.json` it is ignored with a one-line notice.
- Base resolution, first match wins: `--base`; `TURBO_SCM_BASE`; on a PR event `github.event.pull_request.base.sha`; otherwise `git merge-base HEAD origin/<default branch>` after `git fetch origin <default branch>`. The last rule matters because `Build`/`Typecheck`-style workflows trigger on `push` for PR branches (`delivery.build.yml` uses `branches-ignore: [main]`), so there is no PR context. HEAD is `HEAD`.
- On a push to a release branch (`alpha`, `main`), `affected` is forced off: HEAD equals base and nothing would run. Also forced off when the base cannot be resolved: log a warning and run everything (safe direction), unlike raw turbo, which errors.
- Nothing affected: turbo exits 0; `holocron` prints `nothing affected for <task>` and exits 0.
- Checkout needs `fetch-depth: 0` (or an explicit fetch of the base) on every job that passes `affected`.

### 3. Reusables

Each affected-capable reusable gets an input `affected` (boolean, default `false`) that sets `fetch-depth: 0` and passes it to the composite action. Defaults keep every other repo untouched. Thin callers for this repo opt in with `with: affected: true` (emitted by the thin-caller generator, the same file #1242 edits; land #1242 first).

## Behavior of every required check

"README PR" = only `utils/array-utils/README.md` or a root `README.md` changes. "One package" = `src` change in a leaf package (`utils/array-utils`). "Shared" = a change in a package with closure 76 (for example `env-utils`) behaves like a full run until Q1 is decided.

| Required check                              | README PR                                                                                                                                             | One-package PR                                                                                | Notes                                                                                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck / Run tsc --noEmit                | Posts. `turbo --affected` selects nothing or all cache hits; ~setup only.                                                                             | Posts. That package's typecheck + deps' cached builds.                                        | turbo task.                                                                                                                                                                     |
| Static Analysis / Run eslint and actionlint | Posts. eslint cache hit/none; actionlint and the conflict-marker check still run (repo-wide, seconds).                                                | Posts. eslint on the package.                                                                 | Auto-commit of `eslint --fix` only touches affected output. Unverified: whether actionlint still runs once turbo takes over `sourceQuality.staticAnalysis`; confirm in Phase 3. |
| Formatting                                  | Posts, runs in full (~151 s).                                                                                                                         | Same.                                                                                         | No turbo task; unchanged until Phase 6. Prettier on changed files is possible.                                                                                                  |
| Structured Data Validation (yamllint)       | Posts, full run.                                                                                                                                      | Same.                                                                                         | Repo-wide, unchanged.                                                                                                                                                           |
| Secret Detection (gitleaks)                 | Posts, full run.                                                                                                                                      | Same.                                                                                         | Cheap, stays whole.                                                                                                                                                             |
| Commit Standards (commitlint)               | Posts, runs on the PR commits.                                                                                                                        | Same.                                                                                         | Already diff-based.                                                                                                                                                             |
| Repo Validation / Conclusion                | Posts. Validators (ADRs/specs, registry, docs presence) run in full.                                                                                  | Same.                                                                                         | Repo-specific, unchanged.                                                                                                                                                       |
| Test / Conclusion                           | Posts green. `unit` job: setup, `turbo --affected` selects 0-1 packages, cache hit, skip upload (guard). `Conclusion` runs `if: always()`.            | Posts. Tests of the package and dependents; uploads that package's flag.                      | Job name `Run unit tests and collect coverage` unchanged.                                                                                                                       |
| Build / Build every workspace               | Posts. Nothing affected (or all cache hits).                                                                                                          | Posts. Package and dependents.                                                                | Trigger is `push`; base is the merge-base rule.                                                                                                                                 |
| Dead Code Analysis / Run knip               | Posts, runs in full (knip is workspace-wide, not in `turbo.json`).                                                                                    | Same.                                                                                         | Needs a root task with narrow inputs to skip (Phase 6).                                                                                                                         |
| Audit the Bundle Size                       | Posts. No build runs, so no bundle stats upload.                                                                                                      | Posts. Builds affected packages; a cache hit replays outputs and skips the in-build uploader. | Risk: Codecov bundle analysis may see missing bundles as removed (Q6).                                                                                                          |
| codecov/patch, codecov/project              | Must still post: the job runs `codecovcli empty-upload` when there is nothing to upload, which makes Codecov report the required statuses as success. | Post from the one flag's upload plus carryforward of the others.                              | Without an upload on the head commit these two never post and block the merge. Needs a real-PR spike (Q5).                                                                      |

So the "README PR does no real work" line holds for the six turbo-backed checks only. Formatting, yamllint, gitleaks, commitlint, knip and repo validation still run whole (about 11 runner-minutes) until Phase 6; they are cheap and parallel.

## Codecov design (#1250)

Today `codecov.yml` has `component_management` with 73 individual components (one per package, grouped by folder in comments) and no `flag_management`. A PR shows about 75 statuses (`codecov/patch/<component>`), and only the aggregate `codecov/patch` and `codecov/project` are required. The unit-test reusable runs one `codecov/codecov-action` (OIDC, `fail_ci_if_error: true`) with no `flags`, then a second `test_results` upload.

- **Flags:** one per workspace package (its slug, the same name as its component; `docs` has none), generated from the workspace next to `component_management`. `flag_management.default_rules: { carryforward: true }`, an `individual_flags` entry per package, no per-flag `statuses` (so no new contexts). **Not per group folder:** Codecov carries a flag forward whole or not at all, so with a flag per group a PR that tested one package replaced the group's flag with that package's report and the group's other packages dropped out of the totals (the verification PR showed 547 -> 511 files). Carryforward also follows the commit's first-parent history, so a PR branch must descend from an `alpha` commit that uploaded the flags; a branch that merged `alpha` in (GitHub's "Update branch") can show the lower totals.
- **Aggregate contexts only:** keep `codecov/patch` and `codecov/project` required. A "docs-style" extra flag must not count towards them: restrict the aggregate with `coverage.status.project.default.flags: [<group flags>]` and the same for `patch`, generated from the same list. Components stay for the PR comment; make their statuses informational (`component_management.default_rules.statuses` with `informational: true`) to stop the 70-context noise.
- **Upload split.** The `codecov-action` takes one `flags:` per step and a job cannot generate steps. Options:
  - Matrix job: changes the job name to `Run unit tests and collect coverage (<flag>)`, which breaks the required-check string. Needs artifacts to share coverage. Rejected.
  - Generated steps in the thin caller: the steps live in the shared reusable, not the caller. Rejected.
  - Static guarded steps in the reusable, one per known group with `if: hashFiles('<group>/**/coverage/lcov.info') != ''`: works with the stock action and OIDC, hardcodes folder names in a file every repo shares, and silently misses a new group. Fallback.
  - **Recommended:** a composite action `codecov-upload` that takes a JSON list of `{flag, files}` from `holocron` (derived from the workspace groups) and loops the Codecov CLI (`do-upload --flag`) after one `create-commit` and `create-report`, as `codecov-action` does (without them Codecov queues the uploads but never processes them and posts no status). The OIDC spike worked. Job name unchanged, no artifacts, generic for single-package repos (one flag, or none). Needs the OIDC spike: whether the CLI authenticates with `use_oidc` the way the action does.
- **Guard and empty upload:** `if: hashFiles('**/coverage/lcov.info') != ''` on each upload; otherwise run `codecovcli empty-upload`. The `test_results` upload gets the same guard on `**/test-report.junit.xml`.
- **Order constraint (#1232):** flags only mean something once CI skips unaffected groups; ship after Phase 3. Because the dependent closure of most packages is the whole repo (Q1), carryforward only pays off for leaf packages until the graph is fixed.

## Rollout

Every phase is one PR against `alpha` (squash-merged; the title is the release subject). All reusable changes are default-off so other repos keep working.

| #   | PR title                                                                           | Files                                                                                                                                                                   | Verify                                                                                                                                                                                                                                                                    | Roll back                                                                                                         |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 0   | `ci(astromech): 🐛 restore the .turbo cache before the bootstrap build`            | `cli/astromech/src/templates/reusable/actions/setup.yml` (+ generated `.github` copy via sync)                                                                          | Job log shows `Cache restored` before `pnpm build`; setup step drops from ~104 s; second run of a PR shows build `cached`. Key: `turbo-${{ runner.os }}-${{ github.sha }}` with `restore-keys` prefix is fine; add `github.base_ref` scoping only if cache churn is seen. | Revert; the cache steps are additive.                                                                             |
| 1   | `feat(astromech): ✨ scope turbo inputs and global dependencies`                   | `generators/turbo/turbo.ts`, `turbo.test.ts`, `registry/registry.ts` (turbo inputs), regenerated `turbo.json`                                                           | Unit tests of the generator; locally: README edit leaves tests cached, `turbo.json`/lockfile/root-config edit selects all; do one real dependency bump and record which packages turbo selects.                                                                           | Revert; `turbo.json` is regenerated.                                                                              |
| 2   | `feat(cli): ✨ add holocron run --affected and base resolution`                    | `tasks/run/run.ts`, `run.type.ts`, `run.test.ts`, `cli/cli` yargs args, `reusable/actions/holocron.yml`                                                                 | Tests for each base rule and the forced-off cases; run locally against a shallow clone and an unknown ref. No workflow uses it yet.                                                                                                                                       | Revert; default behavior unchanged.                                                                               |
| 3   | `ci(astromech): ⚡️ run unit tests, typecheck, build and dead code with --affected` | the four reusables (`affected` input, `fetch-depth: 0`, upload guard + empty upload), thin-caller generator (`with: affected: true` for this repo), regenerated callers | Roll out through a `.github` branch ref first (below). README-only draft PR: all 13 required checks post green and unit job runs under ~2 min. One-package PR runs only that package. A second push is a full cache hit.                                                  | Set `affected: false` in the caller (one-line regenerate) or revert the thin callers; reusables stay default-off. |
| 4   | `ci(codecov): 🔧 per-folder flags with carryforward and per-flag uploads`          | `codecov.yml` generator (`flag_management`, `flags:` on aggregate statuses, informational components), new `codecov-upload` composite, `verification.unitTests.yml`     | Real PR changing one group: only that flag uploads, `codecov/project` still reflects the others; a README PR posts both statuses via `empty-upload`; no new required contexts appear.                                                                                     | Revert `codecov.yml` and the upload step; old single upload still works (flags are additive).                     |
| 5   | `refactor(cli): ♻️ drop @theholocron/cli from leaf devDependencies` (if Q1 = yes)  | 36 `package.json` files, lockfile, `knip`                                                                                                                               | Dependent closure of `env-utils` falls well below 76; `pnpm install --frozen-lockfile`, build, and every package script still resolve `holocron`.                                                                                                                         | Revert the lockfile and manifests.                                                                                |
| 6   | `ci(astromech): ⚡️ give repo-wide checks narrow root tasks` (optional)             | `generators/turbo`, reusables for formatting, knip, yamllint                                                                                                            | Same README-PR table, but those checks skip.                                                                                                                                                                                                                              | Revert.                                                                                                           |

Order: #1242 (small, same generator file) then 0, 1, 2, 3, 4. Phase 5 can run any time after 2; it is what makes the feature worth much.

### Shared reusable safety

The reusables are copied to `theholocron/.github` (`main`) and called by every repo (the three hops: astromech here, `.github`, each repo). A bad push there breaks all repos and a new input cannot be used until it is on `.github@main`. Mitigations, in order of preference:

1. Defaults preserve behavior: new inputs default off, new composite-action inputs default empty. Merging to `.github@main` is then inert for other repos.
2. Test through a ref: push the templates to a branch of `.github` (`holocron sync github --branch`, as `reusable/sync-github.yml` already does for a PR) and point only this repo's caller at `@<branch>`, then merge. The first-use "bootstrap" deadlock (the caller cannot resolve before the reusable exists) is avoided because the branch exists first.
3. Once #1215/#1216 land, reusables live here and other repos pin `@workflows-v1` (moving tag or SHA, never `@main`). Then a change is tested in this repo's PR and promoted by moving the tag. Composite actions are then referenced by that ref, so they are not exercised in the PR that changes them (known caveat in the consolidation spec).

## Time saving

Measured baseline, 29 runner-minutes and about 5.5 minutes wall per PR (the unit job is the critical path). Estimates, not measurements:

- Phase 0 alone: the cold 84 s workspace build in every job becomes a cache replay. Saves roughly 60-80 s on each of about 11 jobs, so 11-15 runner-minutes per PR and about 1 minute of wall time. It is independent of the rest and the largest cheap win.
- README-only PR after Phases 0-3: unit job drops from 334 s to roughly 120 s (setup plus an empty run), typecheck 217 s to roughly 120 s, build and bundle size similar. Wall time becomes bounded by the whole-repo checks (about 150-210 s). Saves roughly 6-8 runner-minutes and 2-3 minutes wall.
- One-leaf-package PR: tests drop from 145 tasks to roughly 5; unit job roughly 130-160 s.
- PR touching a closure-76 package: no saving until Phase 5.

## Open questions for the maintainer

1. **Dependent closure.** 36 packages devDepend on `@theholocron/cli`, which makes 48 of 76 packages dirty the whole repo. Drop the dependency from leaf packages (Phase 5; the root keeps it, a spike must show `holocron` still resolves from package scripts), or accept it and reword the #1202 acceptance? Recommend: drop it. Without it, "affected" is mostly nominal.
2. **Remote cache.** Vercel returns 402 for the personal `iamnewton` scope. Pay or move to a team scope, run an alternative (self-hosted, `actions/cache` only), or drop `TURBO_TOKEN`? Recommend: rely on `actions/cache` now (Phase 0) and treat the remote cache as optional until someone owns a working account; the warning in `setup.yml` should say "off or rejected". The `.turbo` key names the workflow and job (`turbo-<os>-<workflow>-<job>-<sha>`): `actions/cache` never overwrites an existing key, so with one key per commit only the first job to finish saved its entries and a re-run of the type check or the unit tests missed (found when checking that a second run of the same commit is a full cache hit).
3. **Base for `push` workflows.** Merge-base with the default branch (recommended) versus switching `Build` to also trigger on `pull_request` (it would then use `base.sha`). Recommend merge-base; do not change the trigger.
4. **Workflow files in `globalDependencies`?** The issue says yes; I recommend no, because it forces a full run for every CI tweak and the workflows are linted separately. If yes, expect most CI PRs to be full.
5. **`empty-upload` for the aggregate Codecov checks.** Needed so `codecov/patch` and `codecov/project` post on a README PR. Needs a real-PR spike with OIDC. Alternative: keep a tiny always-run upload job. Recommend `empty-upload`.
6. **Bundle size on cache hits.** The Codecov bundle uploader runs inside the build, so a replayed build uploads nothing. Accept (unchanged bundles are not re-reported) or move the upload to its own task that always runs? Recommend accept, after checking one PR.
7. **Codecov upload shape.** Composite action looping the CLI (recommended, needs the OIDC spike) versus static guarded steps in the reusable (fallback).
8. **Non-turbo checks.** Leave formatting, yamllint, gitleaks, commitlint, knip and repo validation whole (recommended for now, about 11 runner-minutes) or scope them in Phase 6.
9. **`cache-mode` (#1242).** Land it first, as it edits the same generator and the new `with: affected` line. Should the reusables also declare the limit? Recommend yes, default `read`, for low-trust triggers only.

## Evidence

```bash
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
pnpm install --frozen-lockfile && pnpm build               # 72 tasks, 22 s cold
export TURBO_SCM_BASE=origin/alpha
pnpm turbo run verification.unitTests --affected --dry=json  # selection per scenario, see table
pnpm turbo ls --filter="...<pkg>"                            # dependent closure per package (loop over 76)
gh api repos/theholocron/holocron/rulesets/18632155          # required checks
gh api repos/theholocron/holocron/actions/jobs/<id>/logs     # 402 from the remote cache, fetch-depth 1
gh run list --workflow <file> --event pull_request --status success --limit 30 --json startedAt,updatedAt
```
