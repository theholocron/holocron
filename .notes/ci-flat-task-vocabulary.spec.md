---
status: draft
issue: theholocron/holocron#1262
blocked-by: []
related:
  - theholocron/holocron#675
  - theholocron/holocron#1101
  - theholocron/holocron#1215
  - theholocron/holocron#1216
  - theholocron/holocron#1236
  - theholocron/holocron#1478
  - theholocron/holocron#1547
---

# A flat, verb-first vocabulary for tasks

Part of #1262 (align the task names, npm scripts and README tables). This spec supersedes in part
`docs/wiki/specifications/tech-vocabulary-rename.spec.md` (#675): its _decomposition_ of the old `lint` and `audit`
tasks stands, its _naming_ (`<intent>.<task>`) and its "rename in place, no back-compat shim" decision (D3) do not.
It also settles the target names that `.notes/ci-check-taxonomy-rename.spec.md` (#989) and #1547 left open, and it
changes what `.notes/tech-workflows-in-holocron.spec.md` (#1215) has to move. Status is `draft`: the maintainer's five
decisions below are fixed, everything else is a proposal.

## Problem

Three tiers of names describe one command, and each tier has its own spelling:

1. the **intent group** (`Verification`, the workflow `name:`),
2. the **task** (`verification.unitTests`, the key in `TASKS`, `turbo.json`, `package.json` and `tasks:`),
3. the **job** (`Test / Run unit tests and collect coverage`, the check).

A contributor cannot tell which of the three a given command wants. The dotted task names also make a package's
`scripts` unreadable (`"sourceQuality.staticAnalysis": "eslint ."`), and they are not what anyone types: people reach
for `build`, `lint`, `test` and `typecheck` (#1262).

## Decisions (fixed by the maintainer)

1. **Flat, verb-first, one spelling.** The same string is the CLI task, the npm script (root and every package), the
   `turbo.json` task, the workflow `name:` on the Actions page and the caller job in the check name.
2. **Suites with an optional qualifier in the CLI.** `holocron run test` runs the whole suite, `holocron run test unit`
   one leaf. `holocron run ci` keeps running everything that is merge-gating.
3. **One workflow file per leaf in CI.** A suite is a CLI/registry concept only. Combined files stay rejected (#1236):
   GitHub evaluates a job's `if:` before it expands a matrix, so a disabled job cannot disappear from a PR's checks
   (#394, #1062); only not generating the workflow does.
4. **Sources in `ci/` are grouped by suite** (`ci/workflows/test/unit.yml`) and generated flat into
   `.github/workflows`, because GitHub reads workflows only from that one folder and a reusable ref must point there.
5. **The six intent groups stop being workflow names.** They survive only as documentation and `--help` grouping.

## The naming rules

- **An id is `<verb>` or `<verb>-<qualifier>`**, lowercase, hyphen-joined, ASCII letters and digits (`test-unit`,
  `deploy-preview`, `typecheck`). No dots, no colons, no camelCase.
- **The hyphen is the single spelling on every machine surface**: the npm script, the `turbo.json` key, the file name
  (`test-unit.yml`), the workflow `name:` and the caller job. A colon (`test:unit`, the usual npm style) was the
  runner-up and is rejected because a file name cannot carry it, which would make a second spelling for the workflow
  file. The cost: nothing in the string says `test-unit` belongs to a suite. The registry says it (`suite: "test"`), and
  so does the source folder (`ci/workflows/test/unit.yml`).
- **A suite is declared in the registry, never inferred from a prefix.** `deploy` and `deploy-preview` share a prefix
  and are two unrelated leaves; `check-tokens` and `check-preview` share one and must never run together. Four suites
  exist: `test`, `lint`, `scan`, `validate`.
- **In the CLI the qualifier is a second word.** `holocron run test unit` and `holocron run test-unit` are the same
  call. The runner joins positionals with `-` and takes the longest match against the registry; whatever is left over is
  the existing `[job]` argument (`holocron run test unit storybook`). An exact leaf id wins over a suite name, so a
  suite can only exist where no leaf has the bare name. `holocron run <suite> --help` lists its leaves.
- **Verb first.** The verb is what the task does to the repo: `test`, `lint`, `scan`, `validate`, `build`, `publish`,
  `deploy`, `sync`, `check` (probe a live thing), `measure`, `label`. A noun-only name (`bundleSize`, `wiki`, `docs`) is
  renamed to a verb plus its object.
- **Reserved ids**: `ci` (the merge-gating run), `run`, `all`, and every npm/pnpm lifecycle word (next section).

## Suites and leaves

The complete list. "Group" is the old intent group, kept only as a `group` field for `--help` and the docs table.

| Id                  | Suite      | Old task                                     | Group          | Runs                                                      |
| ------------------- | ---------- | -------------------------------------------- | -------------- | --------------------------------------------------------- |
| `test-unit`         | `test`     | `verification.unitTests`                     | Verification   | vitest with coverage (plus the gated Storybook/flow jobs) |
| `test-visual`       | `test`     | `verification.visualRegression`              | Verification   | Chromatic; CI only                                        |
| `test-perf`         | `test`     | `verification.performance`                   | Verification   | Lighthouse CI, only with a lighthouse config              |
| `typecheck`         | none       | `verification.typeSafety`                    | Verification   | `tsc --noEmit`                                            |
| `lint-code`         | `lint`     | `sourceQuality.staticAnalysis`               | Source Quality | eslint, actionlint, merge-conflict markers                |
| `lint-format`       | `lint`     | `sourceQuality.formatting`                   | Source Quality | prettier, editorconfig-checker, markdownlint (check)      |
| `lint-data`         | `lint`     | `sourceQuality.structuredDataValidation`     | Source Quality | yamllint                                                  |
| `lint-unused`       | `lint`     | `sourceQuality.deadCodeAnalysis`             | Source Quality | knip                                                      |
| `lint-commits`      | `lint`     | `platform.commitStandards`                   | Source Quality | commitlint; CI only (the `commit-msg` hook locally)       |
| `scan-secrets`      | `scan`     | `security.secretDetection`                   | Security       | gitleaks                                                  |
| `scan-code`         | `scan`     | `security.codeScanning`                      | Security       | CodeQL; CI only                                           |
| `check-tokens`      | none       | `security.tokenExpiry`                       | Security       | `holocron doctor tokens`; scheduled, never in `ci`        |
| `build`             | none       | `delivery.build`                             | Delivery       | tsdown / vite / rollup / tsc, detected                    |
| `measure-bundle`    | none       | `delivery.bundleSize`                        | Delivery       | bundle stats to Codecov; CI only                          |
| `publish`           | none       | `delivery.publish`                           | Delivery       | semantic-release; CI only                                 |
| `deploy`            | none       | `delivery.deploy`                            | Delivery       | Cloudflare Pages / Vercel; CI only                        |
| `deploy-preview`    | none       | `delivery.previewDeploy`                     | Delivery       | per-PR preview deploy; per-package script                 |
| `check-preview`     | none       | `delivery.previewCheck`                      | Delivery       | monitoring checks against a preview URL; CI only          |
| `validate-specs`    | `validate` | `platform.repoValidation` job `adrs`         | Platform       | `holocron probe specs check`                              |
| `validate-docs`     | `validate` | `platform.repoValidation` job `docsPresence` | Platform       | `holocron probe docs presence` (warns, never fails)       |
| `sync-repo`         | none       | `platform.repoSync`                          | Platform       | `holocron repo sync`                                      |
| `sync-templates`    | none       | `platform.syncTemplates`                     | Platform       | `holocron sync github`; holocron only                     |
| `check-notify`      | none       | `platform.notifyCheck`                       | Platform       | posts real messages; manual only                          |
| `check-dispatched`  | none       | `platform.dispatchedCheck`                   | Platform       | Sentinel's dispatched check; CI only                      |
| `publish-wiki`      | none       | `knowledge.wiki`                             | Knowledge      | Fern; carries `preview`                                   |
| `deploy-docs`       | none       | `knowledge.docs`                             | Knowledge      | Astro build and deploy; carries `preview`                 |
| `deploy-components` | none       | `knowledge.components`                       | Knowledge      | Storybook build and deploy; carries `preview`             |

Workflow-only keys (they are in `tasks:` and have a caller template but no `TASKS` entry):

| Id            | Old key        | Check or run today                                           |
| ------------- | -------------- | ------------------------------------------------------------ |
| `label`       | `bookkeeping`  | `Bookkeeping / Apply Labels`                                 |
| `greet`       | `greetings`    | `Greetings / Greet first-time contributors`                  |
| `mark-stale`  | `stale`        | `stale / Mark stale issues and pull requests`                |
| `update-deps` | `dependencies` | `Dependencies / Update the dependencies`                     |
| `annotate`    | `review`       | `Annotations / Post inline lint annotations`                 |
| `preview`     | `preview`      | `Preview / Preview`, `Preview / Clean up Preview`; unchanged |

Hand-written workflows that already exist in this repo and need an id of their own so the checks are consistent
(#1547 scope; they stay `# HAND-MAINTAINED` and are not generated by this work):

| Id                                             | Today                                                              | Notes                                  |
| ---------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| `validate-deps`                                | `sourceQuality.dependencyCatalogs` (`Dependency catalogs / Check`) | required; joins `validate`             |
| `validate-generated`                           | `sourceQuality.generatedFiles` (`Generated files / Check`)         | required; joins `validate`             |
| `validate-api-docs`                            | `sourceQuality.docsCoverage` (`Docs coverage`)                     | Codecov flag `documentation` unchanged |
| `notify`                                       | `platform.notifications`                                           | see "Things that read workflow names"  |
| `remind-doctor`                                | `platform.doctorReminder`                                          |                                        |
| `sync-specs`                                   | `knowledge.specsToIdeas` (workflow name "Spec discussions")        |                                        |
| `deploy-sentinel`                              | `sentinel.deploy` ("Sentinel Deploy")                              |                                        |
| `sync-sentinel-secrets`                        | `sentinel.secretsSync`                                             |                                        |
| `setup`, `sync-github`, `tag`, `sync-dispatch` | as they are                                                        | already flat; not tasks                |

The 16 plugin packages' `validate` script (`tsx scripts/validate.mjs`) collides with the `validate` suite name. It
becomes `validate-plugin` and joins the suite as a package-level leaf.

### Why these names

- **`typecheck` is its own verb**, not `test-types`: it needs no test runner, runs on a different input set (`src`, no
  `test/`), has its own turbo `dependsOn` and posts a separate required check. People already type `typecheck`.
- **`lint` is a suite of five, not one leaf.** The maintainer's draft read `staticAnalysis` as `lint` and `formatting`
  as `format`, but `lint` is also the suite (static analysis, format, unused code, data, commits). A name cannot be both
  a leaf and its own suite, so the eslint leaf is `lint-code`. `lint-unused` replaces "dead code" because knip reports
  unused files, exports and dependencies, which is what the person fixing it needs to read.
- **`format` is not a task.** The leaf is `lint-format`: a _check_, like every leaf. Writing is a flag
  (`holocron run lint format --fix`), which is also what the auto-commit-fix mechanism of #675 already does in CI. The
  root `pnpm format` (today `prettier --write .`) stays as a convenience script and is a documented wrapper for
  `holocron run lint-format --fix`; it is the one root script that is not a task id (see "npm scripts").
- **`lint-commits`** is commitlint, a linter, so it joins `lint`. It has no local runner in `run`, which skips it with a
  note (as a CI-only leaf does today); the `commit-msg` hook covers the local case.
- **`scan` holds the two things that look for something bad in the repo.** `check-tokens` stays outside because a
  token about to expire is an operations signal, needs the org's secrets, and must never run as part of a suite or `ci`.
- **`check-*` is for probing something live** (a preview URL, a token, a notification channel, a dispatch target). It is
  deliberately not a suite: `holocron run check` would run things that need secrets or a deployment.
- **`measure-bundle`** over `bundle-size`: the second is a noun; the rule is verb first. `analyze-bundle` was the other
  candidate and says less about the number it posts.
- **`validate` suite**: `repoValidation` was two jobs behind a `Conclusion` check, and `docsPresence` is the job that a
  repo can switch off (`jobs: { docsEnforcement: false }`), which is exactly the "disabled job still shows" problem of
  decision 3. As two leaves, a repo that does not want `validate-docs` simply does not list it and no check exists.
  This also removes the `jobs:` switch and `retiredJobs` from the registry. It is a behavior change, so it is its own
  phase (below).
- **`deploy-docs`, `deploy-components`, `publish-wiki`** replace the noun-only `knowledge.*`. `docs` and `components`
  already deploy through the shared `preview.yml`; the verb says so. `preview.yml` stays one shared reusable that two
  leaves call (it is the one place the "one file per leaf" rule is not met, as today); see open question 6.
- **Qualifier words** (`unit`, `visual`, `perf`, `code`, `format`, `unused`, `data`, `commits`, `secrets`, `specs`) are
  what the leaf acts on, and are never a tool name (`eslint`, `vitest` stay inside the registry, as #675 decided).

### Suite behavior in the runner

- `holocron run <suite>` runs the configured members in registry order and always runs all of them, reporting each (the
  behavior of `runGroup` today, which currently matches a dotted prefix and will match a declared suite instead).
- A member that is not in the repo's `tasks:` is not run: a suite is "the leaves this repo has".
- A member with no local runner is reported `skipped (CI only)`, not failed.
- `--affected`, `--filter`, `--base` and `-- <args>` apply to every member that is turbo-delegated, as in `runGroup`.
- `holocron run ci` is unchanged: the `required: true` tasks in `CI_ORDER`, with the ids translated. A suite name is not
  accepted in `ci`'s list; `required` is a property of a leaf because a check is.

## npm lifecycle and package-manager names

npm and pnpm give meaning to some script names, and this vocabulary adds scripts named like tasks to every package.

| Name                                                                                                | What it does to a task of that name                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `publish` (and `prepublishOnly`, `prepack`, `postpack`, `postpublish`)                              | `pnpm publish` and `npm publish` run a script named `publish` _after_ publishing. A `publish` script that calls semantic-release would run on its own after a manual publish, and could recurse. |
| `prepare`, `install`, `preinstall`, `postinstall`                                                   | Run on `pnpm install` (and `prepare` on `pack` and on a git dependency). The root `prepare: husky` stays and is never a task.                                                                    |
| `version`, `preversion`, `postversion`                                                              | Hooks around `npm version`.                                                                                                                                                                      |
| `pre<x>`, `post<x>` for any script `<x>`                                                            | Run automatically around `<x>` unless `enable-pre-post-scripts` is off. A task id that starts with `pre` or `post` followed by another script's name is therefore wrong.                         |
| `test`, `start`, `stop`, `restart`                                                                  | Shortcuts (`pnpm test`); fine for `test`, which is exactly the root suite alias we want.                                                                                                         |
| `deploy`, `publish`, `audit`, `install`, `add`, `update`, `link`, `pack`, `exec`, `store`, `doctor` | pnpm built-in commands: `pnpm deploy` runs pnpm's own `deploy`, not the script. The script is reachable only as `pnpm run deploy`.                                                               |

What it means for this vocabulary:

- **`publish` stays the task id but is never emitted as an npm script.** It has no local runner (`local: null`), and
  scripts are written only for tasks that can run locally, so nothing changes in practice. The registry gets a
  `RESERVED_SCRIPT_NAMES` set (the lifecycle words above) and the validation below fails any package that defines a
  script by one of them, other than the allowed `prepare` at the root.
- **`prepare` is not, and cannot become, a task id.** It is on the reserved list.
- **`deploy` is the second trap.** `apps/sentinel` already has a `delivery.deploy` script; as `deploy` it is called with
  `pnpm run deploy` or `holocron run deploy` and never `pnpm deploy`. The generated README development table
  (`sync-readme`) must print `pnpm run <script>` for any script on the pnpm built-in list, not `pnpm <script>`.
- **`test` is safe and wanted**: the root `test` script is the suite alias. Today's root `test` is
  `turbo run verification.unitTests -- --coverage`; it becomes `holocron run test`.
- Open question 3 asks whether `publish` should instead be renamed (`release`, the pre-#675 name) to remove the trap
  entirely.

## What each surface looks like

### CLI

`holocron run <id>`, `holocron run <suite> [<qualifier>]`, `holocron run ci`. `holocron run --help` lists the suites with
their leaves grouped under the six intent groups. The old dotted names are accepted for a window (see "Deprecation").

### `holocron.config.ts` `tasks:`

Entries use ids: `{ name: "lint-code", required: true }`. A suite name is not valid in `tasks:` (list the leaves; a
leaf in the list is what makes its workflow and check exist). Old names are accepted and normalized for the window.

### `turbo.json`

Generated from the registry (`cli/astromech/src/generators/turbo`): keys are ids, `dependsOn` is
`["build", "^build"]` instead of `["delivery.build", "^delivery.build"]`, and the per-package override in
`holocron.config.ts` (`@theholocron/eslint-config#delivery.build`) becomes `@theholocron/eslint-config#build`.
`holocron probe generated check` already fails on a stale `turbo.json`, which covers this surface.

**Gotcha.** Turbo runs `build` in every package that has a `build` script. `docs/package.json` has `build`
(`astro build --root ..`), which `delivery.build` never touched. Renamed tasks would start building the docs site in
every `turbo run build` and in the `build` check. That script becomes `build-docs` (its verb-first form, matching
`deploy-docs`); `dev` and `preview` stay, since no task has those ids.

### npm scripts

- **Package scripts** are the ids of the leaves the package has, and nothing dotted: `build`, `lint-code`, `typecheck`,
  `test-unit`. The 73 packages that have `delivery.build`, `sourceQuality.staticAnalysis`, `verification.typeSafety`,
  `verification.unitTests` and `test:watch` are rewritten mechanically. `test:watch` becomes `test-watch`, an allowed
  _dev script_ (a short fixed list: `dev`, `preview`, `test-watch`) that is not a task and has no check.
- **Suite aliases in a package** (`lint`, `test`) are optional and written by `repo sync` only when the package has more
  than one leaf in the suite; open question 4.
- **Root scripts** are `build`, `typecheck`, `lint`, `test`, `format`, `deps`, `deps:check`, `holocron`, `prepare`. A leaf
  is `turbo run <id>`; a suite is `holocron run <suite>`. `build` stays `turbo run build` because the built CLI does
  not exist before the first build. `format` is the documented writer (above). Today `syncScripts` is `false` in this
  repo (`astromech.config.ts`), so these are maintained by hand and the check below enforces them.
- **A check keeps them aligned** (closes the "Done when" of #1262): `holocron probe generated check` (or a sibling probe
  inside the same required check) fails when a package script is a dotted old name, is a reserved name, is neither a
  known id nor a dev script, when `sync-readme`'s development table lists a script the package lacks, or when a
  leaf-shaped script exists whose id is not in the registry (so a typo like `test-unt` is caught).

### Workflows

- **Workflow `name:` is the id**: `test-unit`, `deploy-preview`. The six group names (`Verification`, `Source Quality`,
  `Security`, `Delivery`, `Platform`, `Knowledge`) are no longer `name:` values.
- **Caller job `name:` is the id too**, so the check context is `<id> / <called job name>`. Called job names (the text
  after the slash) are unchanged by this spec, which keeps the diff to one segment per check; shortening them is a
  separate choice (open question 7).
- **Caller file** in a repo is `<id>.yml` for a consumer repo. In holocron, where a caller and a reusable cannot share a
  name in one folder, the caller keeps its `ci.` prefix (`ci.test-unit.yml`, decided in #1215) and calls
  `./.github/workflows/test-unit.yml`.

## The `ci/` source layout and the flat output

### Source to output

A leaf's source path is `ci/workflows/<suite>/<leaf>.yml`, or `ci/workflows/<id>.yml` for a leaf in no suite. The
generated, flat name is the source path without the extension and with `/` replaced by `-`, which is the id.

| Source                            | Generated reusable (holocron `.github/workflows/`) | `uses:` from another repo                                    |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `ci/workflows/test/unit.yml`      | `test-unit.yml`                                    | `theholocron/holocron/.github/workflows/test-unit.yml@ci-v1` |
| `ci/workflows/lint/code.yml`      | `lint-code.yml`                                    | `.../lint-code.yml@ci-v1`                                    |
| `ci/workflows/typecheck.yml`      | `typecheck.yml`                                    | `.../typecheck.yml@ci-v1`                                    |
| `ci/workflows/deploy-preview.yml` | `deploy-preview.yml`                               | `.../deploy-preview.yml@ci-v1`                               |

- The mapping is in one function (`flatWorkflowName(sourcePath)`), used by the reusable generator, `ci-ref`, the
  release-group path list (`release.config.ts` builds `ciPaths` from `hostedReusableWorkflows()`), and a test that
  fails if two sources flatten to one name or if a folder is not a registry suite.
- The **registry is the source of truth for membership**; the folder must agree and a test fails when it does not (a
  leaf in `ci/workflows/lint/` whose registry `suite` is not `lint`). Moving a leaf between suites is a rename of the
  file but not of the id, unless the id changes with it.
- `ci/actions/<name>/action.yml` is unchanged: composite actions are not workflows and are referenced by path.
- Callers in a repo are not grouped: GitHub reads only `.github/workflows/*.yml`.

### Effect on the generators

- **`WORKFLOW_TEMPLATES` / `KNOWN_WORKFLOWS`** (`github-action-thin-callers.ts`) are keyed by id, and the per-template `import`
  lines become one glob over `ci/workflows/**`; the id comes from the path, not from a hand list.
- **`ci-ref`.** `TEMPLATE_HOME` and the `REFERENCE` regex (`[\w.-]+`) already match hyphenated names, so `rehome`,
  `rehomeAll`, `reusableWorkflowRef` and `localize` need no logic change. What changes is that the templates are
  written against the flat name, so a template calls `.../test-unit.yml@main` and `rehome` turns it into `@ci-v1`. A
  test pins that no `rehome`d output contains a dotted legacy name.
- **Legacy names while `CI_HOME` points at `.github`.** Until `CI_HOME` flips to `ci-v1`, the repos outside holocron
  still call the frozen copies in `theholocron/.github`, which have the _old_ file names and exist only there. The
  generator must keep emitting the old caller (file name, `uses:` target, workflow and job name) for any `CI_HOME`
  whose ref is `main`, from a `LEGACY_NAMES` table (the old-to-new map below, as code), and emit the flat form only for
  `ci-v1`. `LEGACY_NAMES` is deleted with the frozen copies (#1216). Without this gate, a repo that bumped its CLI
  would be given callers pointing at files that do not exist.
- **`rehome` for holocron itself (`localize`)** maps `.../test-unit.yml@ci-v1` to `./.github/workflows/test-unit.yml`,
  as it does for dotted names.
- **The `ci-v1` tag group** (#1481, `release.config.ts`): its path set is derived from the reusables, so the renames
  move the same files and the release analysis follows. The first `ci-v1` therefore contains _only_ flat names; no
  dotted reusable ever carries that tag. That is the whole point of renaming first.
- **Reusables call each other and composite actions by name** (`ci/actions/*` full refs). Any reusable that calls
  another reusable, and every `holocron run <task>` inside a workflow step, must use the id; a test greps `ci/` for the
  old names.

## Things that read workflow and file names

These are the quiet consumers a rename breaks.

- **`.github/workflows/platform.notifications.yml`** triggers on `workflow_run` with a `workflows:` list of the six
  group names plus `Token Expiry`, `Deploy`, `Preview`, `Sentinel Deploy`, `Spec discussions`, and branches on
  `workflow_run.path` (`platform.repoSync.yml`, `delivery.previewDeploy.yml`, `delivery.previewCheck.yml`). After the
  rename its list must be the ids that matter (`publish`, `deploy`, `deploy-preview`, `check-preview`, ... ) and its
  path tests the flat names. Because `workflow_run` fires only from the default branch, this file must change on `alpha`
  _in the same change_ as the callers, or alerts stop silently. `doctor notifications` (`notificationsWorkflowChecks`)
  gets a check that every id the file lists exists as a workflow name.
- **`required-checks` / `WORKFLOW_CHECK_CONTEXTS` / `CI_ORDER`** (all in astromech) are re-keyed by id.
- **Rulesets** in 8 repos (see migration) and `holocron repo setup`'s `extraRequiredChecks`.
- **Docs and agent text**: `AGENTS.md`/`CLAUDE.md`, `docs/src/content/docs/config.mdx` ("Task vocabulary"),
  `commands/run.mdx`, `run-ci.mdx`, `astromech.mdx`, every package README development block, `.husky/pre-push`
  (`holocron run ci`, unchanged), lint-staged and `configs/` presets (`docsPreset()` / `nodeDocs()`, which still carry
  the pre-#675 vocabulary and must be moved to ids; they ship with the configs group's **next natural release**, not a
  forced one, per the standing note that 8 of its 17 packages are still on `alpha.2`).
- **Codecov**: flag names are package slugs and do not change; the `codecov.yml` component names do not either.

## The guard test that replaces the grouping test

`check-names.test.ts` pins two tables: `EXPECTED_CHECK_NAMES` (every check string) and `EXPECTED_WORKFLOW_NAMES`
(which of the six group names each caller has). The second is the grouping guard and is deleted. In its place:

1. **Identity invariants**, derived, not tabulated: for every template, the workflow `name:` equals its registry id, the
   caller job `name:` equals its id, the generated file basename equals its id, and (in holocron) the caller file is
   `ci.<id>.yml`. A rename of one without the others fails.
2. **`EXPECTED_CHECK_NAMES` stays**, re-keyed by id, with its warning: it is the only thing that stops a harmless-looking
   edit from orphaning a required context in every repo. Its values now start with the id.
3. **Source-layout test**: each `ci/workflows/**` file flattens to a unique id that exists in the registry or the
   workflow-only list, and its folder is that leaf's suite.
4. **A vocabulary test**: no id contains a dot or an uppercase letter, none is on `RESERVED_SCRIPT_NAMES`, every leaf
   has a `group` (one of the six) for `--help`, and every suite member's directory matches.
5. **Required contexts**: the existing "posts every required context" test, unchanged in spirit.

## Old to new: the complete map

### Tasks, workflow files, caller names

The generated holocron caller is `ci.<new id>.yml`; the reusable is `<new id>.yml`. "Old file" is both
`.github/workflows/<old>.yml` (reusable) and `ci.<old>.yml` (holocron caller).

| Old task / key                                                          | New id              | Old file                                                      | New file (reusable)                           | Old workflow `name:` | New `name:`         |
| ----------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------- | --------------------------------------------- | -------------------- | ------------------- |
| `verification.unitTests`                                                | `test-unit`         | `verification.unitTests.yml`                                  | `test-unit.yml`                               | Verification         | `test-unit`         |
| `verification.visualRegression`                                         | `test-visual`       | `verification.visualRegression.yml`                           | `test-visual.yml`                             | Visual Regression    | `test-visual`       |
| `verification.performance`                                              | `test-perf`         | `verification.performance.yml`                                | `test-perf.yml`                               | Verification         | `test-perf`         |
| `verification.typeSafety`                                               | `typecheck`         | `verification.typeSafety.yml`                                 | `typecheck.yml`                               | Verification         | `typecheck`         |
| `sourceQuality.staticAnalysis`                                          | `lint-code`         | `sourceQuality.staticAnalysis.yml`                            | `lint-code.yml`                               | Source Quality       | `lint-code`         |
| `sourceQuality.formatting`                                              | `lint-format`       | `sourceQuality.formatting.yml`                                | `lint-format.yml`                             | Source Quality       | `lint-format`       |
| `sourceQuality.structuredDataValidation`                                | `lint-data`         | `sourceQuality.structuredDataValidation.yml`                  | `lint-data.yml`                               | Source Quality       | `lint-data`         |
| `sourceQuality.deadCodeAnalysis`                                        | `lint-unused`       | `sourceQuality.deadCodeAnalysis.yml`                          | `lint-unused.yml`                             | Source Quality       | `lint-unused`       |
| `platform.commitStandards`                                              | `lint-commits`      | `platform.commitStandards.yml`                                | `lint-commits.yml`                            | Platform             | `lint-commits`      |
| `security.secretDetection`                                              | `scan-secrets`      | `security.secretDetection.yml`                                | `scan-secrets.yml`                            | Security             | `scan-secrets`      |
| `security.codeScanning`                                                 | `scan-code`         | `security.codeScanning.yml`                                   | `scan-code.yml`                               | Security             | `scan-code`         |
| `security.tokenExpiry`                                                  | `check-tokens`      | `security.tokenExpiry.yml`                                    | `check-tokens.yml`                            | Token Expiry         | `check-tokens`      |
| `delivery.build`                                                        | `build`             | `delivery.build.yml`                                          | `build.yml`                                   | Delivery             | `build`             |
| `delivery.bundleSize`                                                   | `measure-bundle`    | `delivery.bundleSize.yml`                                     | `measure-bundle.yml`                          | Delivery             | `measure-bundle`    |
| `delivery.publish`                                                      | `publish`           | `delivery.publish.yml`                                        | `publish.yml`                                 | Delivery             | `publish`           |
| `delivery.deploy`                                                       | `deploy`            | `delivery.deploy.yml`                                         | `deploy.yml`                                  | Delivery             | `deploy`            |
| `delivery.previewDeploy`                                                | `deploy-preview`    | `delivery.previewDeploy.yml`                                  | `deploy-preview.yml`                          | Delivery             | `deploy-preview`    |
| `delivery.previewCheck`                                                 | `check-preview`     | `delivery.previewCheck.yml`                                   | `check-preview.yml`                           | Delivery             | `check-preview`     |
| `platform.repoValidation` (job `adrs`)                                  | `validate-specs`    | `platform.repoValidation.yml`                                 | `validate-specs.yml`                          | Platform             | `validate-specs`    |
| `platform.repoValidation` (job `docsPresence`, alias `docsEnforcement`) | `validate-docs`     | same file                                                     | `validate-docs.yml`                           | Platform             | `validate-docs`     |
| `platform.repoSync`                                                     | `sync-repo`         | `platform.repoSync.yml`                                       | `sync-repo.yml`                               | Platform             | `sync-repo`         |
| `platform.syncTemplates`                                                | `sync-templates`    | `platform.syncTemplates.yml`                                  | `sync-templates.yml`                          | Platform             | `sync-templates`    |
| `platform.notifyCheck`                                                  | `check-notify`      | `platform.notifyCheck.yml`                                    | `check-notify.yml`                            | Platform             | `check-notify`      |
| `platform.dispatchedCheck`                                              | `check-dispatched`  | `platform.dispatchedCheck.yml`                                | `check-dispatched.yml`                        | Dispatched Check     | `check-dispatched`  |
| `knowledge.wiki`                                                        | `publish-wiki`      | `knowledge.wiki.yml`                                          | `publish-wiki.yml`                            | Knowledge            | `publish-wiki`      |
| `knowledge.docs`                                                        | `deploy-docs`       | `ci.knowledge.docs.yml` (caller only; reusable `preview.yml`) | `ci.deploy-docs.yml` (reusable `preview.yml`) | Deploy / Preview     | `deploy-docs`       |
| `knowledge.components`                                                  | `deploy-components` | (via `preview.yml`)                                           | (via `preview.yml`)                           | Deploy / Preview     | `deploy-components` |
| `bookkeeping`                                                           | `label`             | `bookkeeping.yml`                                             | `label.yml`                                   | Platform             | `label`             |
| `greetings`                                                             | `greet`             | `greetings.yml`                                               | `greet.yml`                                   | Platform             | `greet`             |
| `stale`                                                                 | `mark-stale`        | `stale.yml`                                                   | `mark-stale.yml`                              | Stale                | `mark-stale`        |
| `dependencies`                                                          | `update-deps`       | `dependencies.yml`                                            | `update-deps.yml`                             | Platform             | `update-deps`       |
| `review`                                                                | `annotate`          | `review.yml`                                                  | `annotate.yml`                                | Source Quality       | `annotate`          |
| `preview`                                                               | `preview`           | `preview.yml`                                                 | `preview.yml`                                 | Preview              | `preview`           |

Hand-written workflows: `sourceQuality.dependencyCatalogs.yml` to `validate-deps.yml`, `sourceQuality.generatedFiles.yml`
to `validate-generated.yml`, `sourceQuality.docsCoverage.yml` to `validate-api-docs.yml`, `platform.notifications.yml`
to `notify.yml`, `platform.doctorReminder.yml` to `remind-doctor.yml`, `knowledge.specsToIdeas.yml` to
`sync-specs.yml`, `sentinel.deploy.yml` to `deploy-sentinel.yml`, `sentinel.secretsSync.yml` to
`sync-sentinel-secrets.yml`. `setup.yml`, `sync-github.yml`, `tag.yml`, `sync-dispatch.yml` are unchanged.

### Check contexts

Context is `<caller job name> / <called job name>`. Only the first segment changes for the renamed checks.

| Old context (holocron ruleset today)                                     | New context                                                      | Required   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------- |
| `Typecheck / Run tsc --noEmit`                                           | `typecheck / Run tsc --noEmit`                                   | yes        |
| `Static Analysis / Run eslint and actionlint`                            | `lint-code / Run eslint and actionlint`                          | yes        |
| `Formatting / Run prettier, editorconfig-checker, markdownlint`          | `lint-format / Run prettier, editorconfig-checker, markdownlint` | yes        |
| `Structured Data Validation / Run yamllint`                              | `lint-data / Run yamllint`                                       | yes        |
| `Secret Detection / Run gitleaks`                                        | `scan-secrets / Run gitleaks`                                    | yes        |
| `Commit Standards / Run commitlint`                                      | `lint-commits / Run commitlint`                                  | yes        |
| `Repo Validation / Conclusion`                                           | `validate-specs / Validate ADRs and specs`                       | yes        |
| `Repo Validation / Validate docs presence`                               | `validate-docs / Validate docs presence`                         | no (warns) |
| `Test / Conclusion`                                                      | `test-unit / Conclusion`                                         | yes        |
| `Build / Build every workspace`                                          | `build / Build every workspace`                                  | yes        |
| `Dead Code Analysis / Run knip`                                          | `lint-unused / Run knip`                                         | yes        |
| `Audit the Bundle Size / Upload bundle stats to Codecov`                 | `measure-bundle / Upload bundle stats to Codecov`                | yes        |
| `Dependency catalogs / Check`                                            | `validate-deps / Check`                                          | yes        |
| `Generated files / Check`                                                | `validate-generated / Check`                                     | yes        |
| `DCO`, `codecov/patch`, `codecov/project`, `codecov/patch/documentation` | unchanged                                                        | yes        |

The not-required checks follow the same one-segment rule (`Release / Semantic release` to `publish / Semantic release`,
`Deploy / Deploy` to `deploy / Deploy`, `Code Scanning / Analyze (...)` to `scan-code / Analyze (...)`,
`Preview Check / ...` to `check-preview / ...`, and so on); `EXPECTED_CHECK_NAMES` carries the full list.

`Repo Validation / Conclusion` is the one required context that does not map one to one: the aggregator disappears with
the split (phase 3). Until then, `validate-specs` and `validate-docs` are two jobs behind one file, and the context
is `validate / Conclusion`.

### npm scripts

| Old script (every package unless noted)                       | New script                                           |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| `delivery.build`                                              | `build`                                              |
| `sourceQuality.staticAnalysis`                                | `lint-code`                                          |
| `verification.typeSafety`                                     | `typecheck`                                          |
| `verification.unitTests`                                      | `test-unit`                                          |
| `test:watch`                                                  | `test-watch` (dev script)                            |
| `delivery.deploy`, `delivery.previewDeploy` (`apps/sentinel`) | `deploy`, `deploy-preview`                           |
| `validate` (16 plugins)                                       | `validate-plugin`                                    |
| `build`, `dev`, `preview` (`docs`)                            | `build-docs`, `dev`, `preview`                       |
| root `build`: `turbo run delivery.build`                      | `turbo run build`                                    |
| root `lint`: `turbo run sourceQuality.staticAnalysis`         | `holocron run lint`                                  |
| root `test`: `turbo run verification.unitTests -- --coverage` | `holocron run test`                                  |
| root `typecheck`: `turbo run verification.typeSafety`         | `turbo run typecheck`                                |
| root `format`: `prettier --write .`                           | unchanged, documented wrapper of `lint-format --fix` |
| `skills`: `verification.unitTests` (node --test)              | `test-unit` (same command)                           |

Root `lint` changes meaning: it ran one leaf and now runs the suite (static analysis, format, data, unused code,
commits), which is what `pnpm lint` means to a contributor. It is slower; `pnpm lint-code` is the old behavior.

### `holocron.config.ts` and `astromech.config.ts` `tasks:`

This repo's lists translate by the first table:

| In `holocron.config.ts` / `astromech.config.ts`                                                     | New                                                                 |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `sourceQuality.staticAnalysis` (+ `turbo.dependsOn: ["@theholocron/eslint-config#delivery.build"]`) | `lint-code` (+ `["@theholocron/eslint-config#build"]`)              |
| `sourceQuality.formatting`, `.structuredDataValidation`                                             | `lint-format`, `lint-data`                                          |
| `security.secretDetection`, `security.codeScanning`                                                 | `scan-secrets`, `scan-code`                                         |
| `platform.commitStandards`                                                                          | `lint-commits`                                                      |
| `verification.unitTests` (`with: { affected, uploads }`)                                            | `test-unit` (same `with`)                                           |
| `verification.typeSafety`                                                                           | `typecheck`                                                         |
| `delivery.build` (`turbo.passThroughEnv`)                                                           | `build`                                                             |
| `sourceQuality.deadCodeAnalysis`, `delivery.bundleSize`                                             | `lint-unused`, `measure-bundle`                                     |
| `platform.repoValidation` (+ `jobs: { docsEnforcement }`)                                           | `validate-specs`, and `validate-docs` if wanted; `jobs:` is retired |
| `delivery.publish` (`groups`, ...)                                                                  | `publish`                                                           |
| `knowledge.docs` (`with: { preview: true }`)                                                        | `deploy-docs`                                                       |
| `review`, `stale`, `greetings`, `dependencies`, `bookkeeping`                                       | `annotate`, `mark-stale`, `greet`, `update-deps`, `label`           |

`with:` keys, `required`, `turbo` overrides and `groups` do not change.

## Migration

### Facts that set the order

- `ci-v1` does not exist and #1478 has not started. Nothing outside holocron calls a flat name yet.
- A check string is `<caller job> / <called job>`, written by the _caller_ the generator emits. A repo's required
  contexts change only when its callers are regenerated, and the callers of the 8 repos can only point at flat reusables
  once those exist at a resolvable ref, which is `ci-v1` (the frozen copies in `.github` keep the old names for good).
- `ci-v1` is created on a `main` commit, and `main` is 400+ commits behind `alpha` (#1101). The tag therefore waits for
  the promotion.
- A PR that renames a caller posts only the new contexts, so it cannot satisfy a ruleset that still lists the old ones.
  #1547's "add the new context, merge, then remove the old" works when the _called_ side moves and callers stay put; here
  the callers change in the same PR, so the old contexts will be missing on that PR. Each such PR needs the maintainer's
  merge with the ruleset edited around it (see "Cost of required check names").

So: **rename before `ci-v1` and each repo changes its checks once** (the repoint PR of #1478 is also the rename PR).
Rename after, and each of the 8 repos changes twice. This is the reason this spec has to land first.

### Order

1. **Spec accepted** and the phase issues filed (below).
2. **Phase 1 (alpha): vocabulary in the registry, CLI, config, turbo, scripts, with aliases.** Nothing posts a different
   check yet. Mergeable on `alpha` with no ruleset work. The CLI and config accept old names (below), so the frozen
   `.github` reusables, which still run `holocron run verification.unitTests`, keep working against a newer CLI.
3. **Phase 2 (alpha): `ci/` regrouped, flat reusables, callers, check names in holocron itself.** This is the PR with
   the ruleset cost, for one repo. Includes `platform.notifications.yml`, `EXPECTED_CHECK_NAMES`, the guard test
   replacement, and the legacy-name gate in the generator so that the other 7 repos and the templates still get old
   callers.
4. **Phase 3 (alpha): split `repoValidation` into `validate-specs` and `validate-docs`** and retire `jobs:` and
   `retiredJobs`. Optional and independent; can follow `ci-v1`, but doing it before means the 8 repos see one fewer
   rename.
5. **#1101: alpha is promoted to main.** Nothing in 1 to 3 is on `main` until then, so no frozen copy changed. Before
   the promotion's `Sync Templates` run, the freeze of #1477 must be in (`sync github` no longer pushes the moved
   reusables); otherwise it would add flat-named files to `theholocron/.github`, harmless but unreferenced.
6. **`ci-v1` is created** on the promoted `main` commit by the first release of the `ci` group. Only flat names exist
   at that tag.
7. **Phase 4: flip `CI_HOME` to `CI_TARGET` (`ci-v1`) and drop the legacy gate** in one CLI release, then `holocron repo
sync` opens one PR per repo (#1478): callers renamed and repointed, scripts migrated, `tasks:` rewritten, and the
   ruleset contexts replaced. The maintainer merges them one at a time.
8. **Phase 5: remove the aliases** and `LEGACY_NAMES` once `holocron probe ci refs` reports zero
   `theholocron/.github/.github/` references and the leftover scan (below) reports no old name anywhere (#1216 deletes
   the frozen copies).

If the promotion slips, steps 2 and 3 are still worth landing: holocron's own checks change once, now, and the
promoted tree is already flat.

### Cost of required check names

- **Holocron** (phase 2). 13 required contexts change their first segment. The PR itself cannot merge against the old
  ruleset. Two ways to do it, in order of preference: (a) _dual-run_: a first PR adds the flat callers next to the old
  ones (two sets of checks for a day), a ruleset step requires both sets, a second PR deletes the old callers, and a
  last step drops the old contexts. No unmergeable PR, double CI for the window. (b) _bypass_: the maintainer edits the
  ruleset right before the merge (remove the 13 old, add the 13 new) and right after it checks that all 13 post.
  Recommended: (b) for holocron, because the dual-run needs two workflow generators alive at once, which is the
  complexity this spec avoids. Either way the sequence is written down in the phase 2 issue.
- **The 7 other repos plus the org site** (phase 4). One ruleset edit per repo, in the same sitting as the repoint
  merge: add the new contexts to the ruleset (the PR will post them), merge the repoint PR by bypass, delete the old
  contexts. `holocron repo setup` (strict) already writes the derived list, so the edit is `repo setup` run once per repo
  after the merge; the check is that `requiredChecks()` equals the ruleset. Do the repos one at a time, as #1478 says;
  a repo not yet repointed keeps its old contexts and the frozen copies.
- **What is not affected**: Codecov contexts, DCO, and any check posted by Sentinel (it names its checks itself; whether
  to align them is #989's question).
- **Future cost.** Every future rename pays this again. A single stable required check per repo (an aggregator job
  named `ci`) would stop that for good, and `workflows` rules in rulesets (#678) are the other route. Neither is
  decided here; open question 5.

### Deprecation alias

Needed, for two reasons that are independent of the check names: the frozen reusables in `theholocron/.github` run
`holocron run <old id>` and keep doing so until they are deleted (#1216), and `tasks:` in 8 repos' configs and their
`package.json` scripts will not all change on the same day as the CLI.

- **`holocron run <old dotted id>`** resolves through `LEGACY_NAMES` to the new id and prints a one-line deprecation
  notice on stderr (it prints in CI too, so the finding is seen).
- **`tasks:` accepts old names** and normalizes them (`normalizeTaskEntry`), with the same notice from `config show`
  and `doctor`. `holocron repo sync` does not rewrite a TypeScript config; it reports the exact replacement.
- **`repo sync` migrates `package.json` scripts**: a script whose key is an old id is renamed in place to the new id
  when its value is untouched; one that was edited is left and reported.
- **Not aliased**: workflow names, file names and check contexts. A check cannot have two names, which is why the
  window for checks is the single merge of each repo's repoint PR.
- **How long**: until the leftover scan is clean in all repos and #1216 has deleted the frozen copies, then one more
  minor of the CLI; the alias is removed in a `feat!`/breaking commit and is not part of the v5 stable promise.

### Catching leftovers

- **`holocron probe generated check`** (already the required `Generated files / Check`) fails on any stale generated
  file, so a workflow, `turbo.json` or caller still on an old name in a repo is caught as drift.
- **A new probe, `holocron probe tasks names`** (it can be a job of the same required check), scans the _hand-written_
  places generation does not own: `holocron.config.ts` and `astromech.config.ts` `tasks:`, every `package.json`
  `scripts`, README and docs code blocks, `.husky`, lint-staged, hand-written workflows and the reusable `run:` steps.
  It reports each old dotted name with file, line and replacement, as `warn` in the window and `fail` after, plus the
  reserved-name and dev-script rules above. It reads the registry's `LEGACY_NAMES`, so it knows exactly what to look for.
- **`holocron doctor` (repo)** compares the ruleset's required contexts with `requiredChecks()`: a context in the ruleset
  that no workflow posts is `stale context`, and one the derived list wants that the ruleset lacks is `missing`.
  This is the check run after each repoint merge.
- **`holocron doctor notifications`** adds the "every listed workflow exists" check described above.
- **The `ci refs` scan** from #1473 keeps counting `theholocron/.github/.github/` references; the two scans together
  say when phase 5 may start.

## Phased plan and issues

Suggested issues. None are created by this spec. Each phase is one PR unless noted; every PR carries its own tests and
docs (org rule), so no "docs follow-up" issues.

| #   | Issue                                                                                            | Depends on         | Notes                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `refactor(astromech): 🏷️ flat verb-first task ids and suites in the registry, runner and config` | spec accepted      | `TASKS`, `CI_ORDER`, suites, `[job]` resolution, `LEGACY_NAMES`, aliases in `run` and `tasks:`, `run --help` grouping, reserved names              |
| B   | `refactor(astromech): ♻️ generate turbo.json and package scripts from the flat ids`              | A                  | turbo keys, `repo sync` script migration, README `sync-readme` check, `pnpm run` for pnpm built-ins                                                |
| C   | `refactor(repo): ♻️ rename scripts and tasks across this monorepo` (mechanical)                  | A, B               | 73 packages, root scripts, `docs` `build-docs`, plugin `validate-plugin`, `tasks:` lists                                                           |
| D   | `feat(cli): ✅ holocron probe tasks names and the doctor ruleset comparison`                     | A                  | leftover detection; lands before C so C is verified by it                                                                                          |
| E   | `refactor(ci): 🗂️ group ci/ sources by suite and generate flat reusables`                        | A                  | `flatWorkflowName`, glob templates, `release.config.ts` paths, layout and uniqueness tests                                                         |
| F   | `refactor(ci): 🏷️ workflow, job and file names are the task id; replace the grouping guard`      | E                  | caller generator + legacy gate, `ci.<id>.yml`, `platform.notifications.yml`, `EXPECTED_CHECK_NAMES`, identity tests; the ruleset step for holocron |
| G   | `refactor(astromech): ✂️ split repoValidation into validate-specs and validate-docs`             | F                  | drops `jobs:`, `retiredJobs`, and the `Conclusion` aggregator                                                                                      |
| H   | `docs: 📚 task vocabulary, command pages, AGENTS.md and READMEs for the flat ids`                | lands with A, C, F | listed so each of those PRs updates its part; not a separate PR                                                                                    |
| I   | `refactor(ci): 🧭 flip CI_HOME to ci-v1 and repoint the 8 repos on the flat names`               | #1101, `ci-v1`, F  | this is #1478 with the rename folded in; one PR per repo, ruleset step per repo                                                                    |
| J   | `chore(astromech): 🔥 remove the dotted aliases and LEGACY_NAMES`                                | I, #1216           | breaking                                                                                                                                           |
| K   | `feat(configs): 🧩 presets speak the flat ids`                                                   | A                  | ships with the next natural configs release, not a forced one                                                                                      |

#1547 (check-label cleanup) is subsumed by F and I: its "decide the target label per task" is answered here (the id), and
its recipe becomes the phase 2 and phase 4 steps above. #1478 becomes I. #989's taxonomy table is superseded by this
vocabulary except for the Sentinel-posted checks.

## Open questions

1. **Hyphen or colon.** The spec picks the hyphen because of file names. If the maintainer prefers `test:unit` for npm
   scripts, turbo and checks, the workflow file would need a second spelling (`test-unit.yml`), which breaks decision
   1. Settled only if you accept the hyphen.
2. **`format` as a top-level verb.** Your draft had `formatting` as `format`. The spec makes it `lint-format` (a check)
   with `--fix` for writing. If `pnpm format` must stay the one writer verb, the alternative is a standalone `format`
   leaf outside `lint`, with `lint-format` removed and the check behavior moved behind a flag.
3. **`publish`.** Kept, with the lifecycle trap documented and no script emitted. The alternative is `release` (the
   pre-#675 name, also what semantic-release does), which has no npm meaning and removes the reserved-name rule's one
   awkward case. Either works for decision 1.
4. **Package-level suite aliases.** Typing `pnpm lint` inside a package fails if the package has only `lint-code`.
   Generate `lint` and `test` aliases (as `holocron run <suite>` scoped to the package) for every package, or only the
   ones with more than one leaf? Needs the check that `holocron run` scopes to the current package from a package
   directory.
5. **A stable required check per repo.** Would end rename cost for good (a single `ci` aggregator), but it hides which
   check failed in the branch protection list. Out of scope for this spec; decide before the next rename.
6. **`preview.yml`.** One reusable for `deploy-docs`, `deploy-components` and the workflow-only `preview`. Keep as the
   one shared exception to "one file per leaf", or give each its own file? Splitting means more files but no `docs:`
   input.
7. **Called job names.** After the rename, a check reads `test-unit / Run unit tests and collect coverage`. Shorten the
   second segment (`test-unit / unit`)? It is a second rename of every required context, so if wanted it must be done
   inside the same phase 2 and phase 4 windows, not later.
8. **Sentinel's checks** (`Platform / Compliance / ...`, five lint-split checks) are named by the app. Align them with
   the ids, or leave them under #989?
9. **The Storybook, interaction and user-flow jobs** inside `test-unit` are gated by `run-*` inputs behind a
   `Conclusion` job, which is the same shape decision 3 rules out. Split them into `test-storybook`, `test-a11y` and
   `test-flow` leaves in a later phase, or accept them as jobs?
10. **The `[job]` argument.** `holocron run test unit storybook` needs the longest-match rule; confirm
    that no existing `holocron run <task> <job>` call has a job named like a qualifier (only `adrs` and `docsPresence`
    are used today, and both go away in phase 3).
11. **`notify` workflow filter.** Replace the `workflows:` list with the ids, or generate it from the registry so it
    cannot drift?
12. **Does the repoint PR need a ruleset bypass actor** on every one of the 8 repos? If not, option (a) (dual-run) is
    needed for those repos and the cost estimate changes.
