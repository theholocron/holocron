---
id: SPEC-0064
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
discussion:
  url: https://discord.com/channels/1303969001822486568/1566940897038569545
---

# A flat, verb-first vocabulary for tasks

Part of #1262 (align the task names, npm scripts and README tables). This spec supersedes in part
`docs/wiki/specifications/tech-vocabulary-rename.spec.md` (#675): its _decomposition_ of the old `lint` and `audit`
tasks stands, its _naming_ (`<intent>.<task>`) and its "rename in place, no back-compat shim" decision (D3) do not.
It also settles the target names that `.notes/ci-check-taxonomy-rename.spec.md` (#989) and #1547 left open, and it
changes what `.notes/tech-workflows-in-holocron.spec.md` (#1215) has to move. Status is `draft`: the maintainer's
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

1. **Flat, verb-first, one spelling**, with a colon for a member of a suite: `test`, `test:unit`, `lint`, `lint:code`.
   The same string is the CLI task, the npm script (root and every package), the `turbo.json` task key, the workflow
   `name:` and the caller job name in the check. The only place a colon cannot go is a file name, so the workflow file
   and the `ci/` source file map `:` to `-` through one function (below).
2. **Suites with an optional qualifier in the CLI.** `holocron run test` runs the whole suite, `holocron run test unit`
   and `holocron run test:unit` run one leaf. `holocron run ci` keeps running everything that is merge-gating.
3. **One workflow file per leaf in CI.** A suite is a CLI/registry concept only. Combined files stay rejected (#1236):
   GitHub evaluates a job's `if:` before it expands a matrix, so a disabled job cannot disappear from a PR's checks
   (#394, #1062); only not generating the workflow does.
4. **Sources in `ci/` are grouped by suite** (`ci/workflows/test/unit.yml`) and generated flat into
   `.github/workflows`, because GitHub reads workflows only from that one folder and a reusable ref must point there.
5. **The six intent groups stop being workflow names.** They survive only as documentation and `--help` grouping.
6. **Scripts delegate, in one direction.** In a monorepo with a `turbo.json` (holocron included) the root scripts call
   turbo directly (`"test": "turbo run test"`, `"test:unit": "turbo run test:unit"`), because `holocron` is built from
   this repo and its bin does not exist on a fresh clone, while turbo is an ordinary devDependency. A suite is an
   aggregator task in the generated `turbo.json`. A single-package repo without turbo uses `holocron run <task>`.
   `holocron run` stays the CLI and CI front door and already prefers `turbo run` when `turbo.json` defines the task. A
   package's leaf scripts hold the real tool command. pnpm appends extra arguments, so there is no `$1`.
7. **`format` is a standalone verb, not a suite and not under `lint`**: prettier only, writes by default, `--check` is the
   read-only form. editorconfig-checker and markdownlint are linters and become `lint` leaves.
8. **`publish` is renamed `release`**, which has no meaning to npm or pnpm.
9. **One stable aggregate required check per repo**, which must be debuggable: it lists the failing jobs with links. It is
   a polling job (Sentinel is down, #1100); Sentinel posting the check is a documented later option. `DCO` stays its own
   required context; `ci` waits on `codecov/*`.
10. **Unit tests always run with coverage.** There is no `--coverage` flag anywhere.
11. **A hyphen compound takes a colon only as an npm script** (`deploy:preview`, `sync:repo`); everywhere else it keeps
    its hyphen (`deploy-preview`). No non-runnable suites are created for them.

## The naming rules

- **An id is `<verb>`, `<verb>-<object>` or `<suite>:<leaf>`**, lowercase ASCII letters and digits. A colon means "member
  of the suite named before it"; a hyphen is part of a verb phrase (`deploy-preview`, `check-tokens`) and never implies a
  suite. No dots, no camelCase.
- **The one exception to one spelling: a hyphen compound's npm script.** `scriptName(id)` replaces the first hyphen
  with a colon for an id that has a script, so the task `deploy-preview` is the script `deploy:preview`, `sync-repo` is
  `sync:repo` and `sync-templates` is `sync:templates`. A turbo key must equal the package script it runs, so turbo uses
  the script spelling too. The CLI accepts both (`holocron run deploy-preview`, `deploy:preview`, `deploy preview`);
  files, workflow names, check names and `tasks:` keep the hyphen. This does not make `deploy` or `sync` a suite: there
  is no `dependsOn` between `deploy` and `deploy:preview`, and `holocron run deploy` still means the one leaf. CI-only
  ids with no script (`check-tokens`, `release`, `publish-wiki`) have no script spelling.
- **Why a colon and not a hyphen.** A hyphen was this spec's first choice, because a file name cannot carry a colon and
  one spelling everywhere was easiest to keep with one character. The colon wins because npm and pnpm already use it for
  a variant of a script (`test:watch`, `lint:fix`), `pnpm test:unit` works unquoted, a suite and its members then read as
  a family (`pnpm run "/^lint:/"` selects one), and the id says which names are a suite's members without a lookup.
  The cost is one deterministic mapping at the file boundary (below), and a uniqueness rule: a colon id and a hyphen id
  must never flatten to the same file name (a suite `lint` with a leaf `code` and an id `lint-code` cannot both exist;
  a test fails).
- **Colons are confirmed to work in the tools.** Turbo accepts them as task keys and `turbo run test:unit lint:code`
  runs them (tried on a throwaway two-file workspace with turbo, scripts `test:unit` and `lint:code`; both ran). The
  `pkg#task` form uses `#`, so it is not affected. In GitHub Actions a colon is fine in a workflow `name:`, a job
  `name:` and a check context (`test:unit / Run unit tests`), but **not in a job id** (`jobs.<id>` allows letters,
  digits, `-` and `_`), so the generated caller's job _id_ is the flattened form (`test-unit`) while its `name:` is the
  id. The generator quotes the colon-bearing `name:` values (`yamlScalar`). **Not confirmed**: the `workflow_run.workflows`
  filter of `platform.notifications.yml` with a colon-bearing name has not been tried; the phase that changes that file
  must test it.
- **A suite is declared in the registry.** Four exist: `test`, `lint`, `scan`, `validate`. A suite id is never also a
  leaf id. `check-*` (things that probe something live) are deliberately not a suite, because `holocron run check` would
  run work that needs secrets or a deployment.
- **In the CLI the qualifier is a second word.** `holocron run test unit` and `holocron run test:unit` are the same call.
  The runner joins positionals with `:`, takes the longest match against the registry and treats whatever is left as the
  existing `[job]` argument (`holocron run test unit storybook`). `holocron run <suite> --help` lists its leaves.
- **Verb first.** The verb is what the task does to the repo: `test`, `lint`, `format`, `scan`, `validate`, `build`,
  `release`, `deploy`, `sync`, `check`, `measure`, `label`. A noun-only name (`bundleSize`, `wiki`, `docs`) is renamed to
  a verb plus its object.
- **Reserved ids**: `ci` (the merge-gating run and, below, the aggregate check), `run`, `all`, and every npm/pnpm
  lifecycle word (next section).

## Suites and leaves

"Group" is the old intent group, kept only as a `group` field for `--help` and the docs table. "Scope" is **package**
(turbo-delegated, runs in each package that has the script) or **repo** (runs once at the root: a linter group, a
probe, a workflow).

| Id                  | Suite      | Scope   | Old task                                     | Group          | Runs                                                      |
| ------------------- | ---------- | ------- | -------------------------------------------- | -------------- | --------------------------------------------------------- |
| `test:unit`         | `test`     | package | `verification.unitTests`                     | Verification   | vitest with coverage (plus the gated Storybook/flow jobs) |
| `test:visual`       | `test`     | repo    | `verification.visualRegression`              | Verification   | Chromatic; CI only                                        |
| `test:perf`         | `test`     | repo    | `verification.performance`                   | Verification   | Lighthouse CI, only with a lighthouse config              |
| `typecheck`         | none       | package | `verification.typeSafety`                    | Verification   | `tsc --noEmit`                                            |
| `lint:code`         | `lint`     | package | `sourceQuality.staticAnalysis`               | Source Quality | eslint, actionlint, merge-conflict markers                |
| `lint:editorconfig` | `lint`     | repo    | `sourceQuality.formatting` (part)            | Source Quality | editorconfig-checker                                      |
| `lint:markdown`     | `lint`     | repo    | `sourceQuality.formatting` (part)            | Source Quality | markdownlint                                              |
| `lint:data`         | `lint`     | repo    | `sourceQuality.structuredDataValidation`     | Source Quality | yamllint                                                  |
| `lint:unused`       | `lint`     | repo    | `sourceQuality.deadCodeAnalysis`             | Source Quality | knip                                                      |
| `lint:commits`      | `lint`     | repo    | `platform.commitStandards`                   | Source Quality | commitlint; CI only (the `commit-msg` hook locally)       |
| `format`            | none       | repo    | `sourceQuality.formatting` (part)            | Source Quality | prettier only; writes, `--check` reads; **no workflow**   |
| `scan:secrets`      | `scan`     | repo    | `security.secretDetection`                   | Security       | gitleaks                                                  |
| `scan:code`         | `scan`     | repo    | `security.codeScanning`                      | Security       | CodeQL; CI only                                           |
| `check-tokens`      | none       | repo    | `security.tokenExpiry`                       | Security       | `holocron doctor tokens`; scheduled, never in `ci`        |
| `build`             | none       | package | `delivery.build`                             | Delivery       | tsdown / vite / rollup / tsc, detected                    |
| `measure-bundle`    | none       | repo    | `delivery.bundleSize`                        | Delivery       | bundle stats to Codecov; CI only                          |
| `release`           | none       | repo    | `delivery.publish`                           | Delivery       | semantic-release; CI only                                 |
| `deploy`            | none       | package | `delivery.deploy`                            | Delivery       | Cloudflare Pages / Vercel; CI only                        |
| `deploy-preview`    | none       | package | `delivery.previewDeploy`                     | Delivery       | per-PR preview deploy; per-package script                 |
| `check-preview`     | none       | repo    | `delivery.previewCheck`                      | Delivery       | monitoring checks against a preview URL; CI only          |
| `validate:specs`    | `validate` | repo    | `platform.repoValidation` job `adrs`         | Platform       | `holocron probe specs check`                              |
| `validate:docs`     | `validate` | repo    | `platform.repoValidation` job `docsPresence` | Platform       | `holocron probe docs presence` (warns, never fails)       |
| `sync-repo`         | none       | repo    | `platform.repoSync`                          | Platform       | `holocron repo sync`                                      |
| `sync-templates`    | none       | repo    | `platform.syncTemplates`                     | Platform       | `holocron sync github`; holocron only                     |
| `check-notify`      | none       | repo    | `platform.notifyCheck`                       | Platform       | posts real messages; manual only                          |
| `check-dispatched`  | none       | repo    | `platform.dispatchedCheck`                   | Platform       | Sentinel's dispatched check; CI only                      |
| `publish-wiki`      | none       | repo    | `knowledge.wiki`                             | Knowledge      | Fern; carries `preview`                                   |
| `deploy-docs`       | none       | repo    | `knowledge.docs`                             | Knowledge      | Astro build and deploy; carries `preview`                 |
| `deploy-components` | none       | repo    | `knowledge.components`                       | Knowledge      | Storybook build and deploy; carries `preview`             |

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

| Id                                             | Today                                                              | Notes                                 |
| ---------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `validate:deps`                                | `sourceQuality.dependencyCatalogs` (`Dependency catalogs / Check`) | required; joins `validate`            |
| `validate:generated`                           | `sourceQuality.generatedFiles` (`Generated files / Check`)         | required; joins `validate`            |
| `validate:api-docs`                            | `sourceQuality.docsCoverage` (`Docs coverage`)                     | Codecov flag `documentation` as is    |
| `notify`                                       | `platform.notifications`                                           | see "Things that read workflow names" |
| `remind-doctor`                                | `platform.doctorReminder`                                          |                                       |
| `sync-specs`                                   | `knowledge.specsToIdeas` (workflow name "Spec discussions")        |                                       |
| `deploy-sentinel`                              | `sentinel.deploy` ("Sentinel Deploy")                              |                                       |
| `sync-sentinel-secrets`                        | `sentinel.secretsSync`                                             |                                       |
| `setup`, `sync-github`, `tag`, `sync-dispatch` | as they are                                                        | already flat; not tasks               |

The 16 plugin packages' `validate` script (`tsx scripts/validate.mjs`) collides with the `validate` suite name. It
becomes `validate:plugin` and joins the suite as a package-scoped leaf.

### Why these names

- **`typecheck` is its own verb**, not `test:types`: it needs no test runner, runs on a different input set (`src`, no
  `test/`), has its own turbo `dependsOn` and posts a separate check. People already type `typecheck`.
- **`lint` is a suite of six.** The maintainer's draft read `staticAnalysis` as `lint`; `lint` is also the suite, and a
  name cannot be both a leaf and its own suite, so the eslint leaf is `lint:code`. `lint:unused` replaces "dead code"
  because knip reports unused files, exports and dependencies, which is what the person fixing it needs to read.
- **`lint:markdown`, not `lint:docs`.** The qualifier names what the linter acts on, like `lint:data` and `lint:code`.
  `docs` already means two other things in this vocabulary (`validate:docs`, the docs-presence warning, and
  `deploy-docs`), and markdownlint also lints READMEs, specs and agent files that are not docs.
- **`format` is not a suite and not a linter.** It is the one task that writes by default: `holocron run format` and
  `pnpm format` rewrite files, `--check` is the read-only form (what the old check job did). It runs prettier only.
  editorconfig-checker and markdownlint only report, so they are linters (`lint:editorconfig`, `lint:markdown`).
- **`lint:commits`** is commitlint, a linter, so it joins `lint`. It has no local runner in `run`, which skips it with a
  note (as a CI-only leaf does today); the `commit-msg` hook covers the local case.
- **`scan` holds the two things that look for something bad in the repo.** `check-tokens` stays outside because a token
  about to expire is an operations signal, needs the org's secrets, and must never run as part of a suite or `ci`.
- **`measure-bundle`** over `bundle-size`: the second is a noun; the rule is verb first.
- **`release`, not `publish`.** semantic-release is what runs, "release" is what the repo calls it, and `publish` is an
  npm lifecycle word (next section). `publish-wiki` stays: only the bare `publish`, `prepublish*` and `postpublish`
  are lifecycle names.
- **`validate` suite**: `repoValidation` was two jobs behind a `Conclusion` check, and `docsPresence` is the job that a
  repo can switch off (`jobs: { docsEnforcement: false }`), which is exactly the "disabled job still shows" problem of
  decision 3. As two leaves, a repo that does not want `validate:docs` does not list it and no check exists. This also
  removes the `jobs:` switch and `retiredJobs` from the registry. It is a behavior change, so it is its own phase.
- **`deploy-docs`, `deploy-components`, `publish-wiki`** replace the noun-only `knowledge.*`. `docs` and `components`
  already deploy through the shared `preview.yml`; the verb says so (see open question 2).
- **Qualifier words** (`unit`, `visual`, `perf`, `code`, `editorconfig`, `markdown`, `data`, `unused`, `commits`,
  `secrets`, `specs`) are what the leaf acts on or the tool's own name where the tool is the thing (`editorconfig`).
  Tool names like `eslint` and `vitest` stay inside the registry, as #675 decided.

### Suite behavior in the runner

- `holocron run <suite>` runs the configured members in registry order and always runs all of them, reporting each (the
  behavior of `runGroup` today, which currently matches a dotted prefix and will match a declared suite instead).
- A member that is not in the repo's `tasks:` is not run: a suite is "the leaves this repo has".
- A member with no local runner is reported `skipped (CI only)`, not failed.
- **From a package directory** `holocron run <suite>` runs only the package-scoped members for that package (turbo
  `--filter=.`) and reports the repo-scoped ones as `skipped (repo-wide, run from the root)`.
- `--affected`, `--filter`, `--base` and `-- <args>` apply to every member that is turbo-delegated, as in `runGroup`.
  Because pnpm appends arguments without `--`, an unknown flag after a leaf (`holocron run lint code --fix`) is
  forwarded to its tool, and after a suite of several leaves it is an error that says so. None of this is needed for
  coverage: unit tests always run with coverage and there is no `--coverage` flag.
- `holocron run ci` is unchanged in spirit: the `required: true` tasks in `CI_ORDER`, with the ids translated, and
  `format` in its read-only `--check` form (cheap, local only). A suite name is not accepted in `ci`'s list.

## npm lifecycle and package-manager names

npm and pnpm give meaning to some script names, and this vocabulary adds scripts named like tasks to every package.

| Name                                                                                                | What it does to a task of that name                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publish` (and `prepublishOnly`, `prepack`, `postpack`, `postpublish`)                              | `pnpm publish` and `npm publish` run a script named `publish` _after_ publishing: a task of that name would run on its own and could recurse.                     |
| `prepare`, `install`, `preinstall`, `postinstall`                                                   | Run on `pnpm install` (and `prepare` on `pack` and on a git dependency). The root `prepare: husky` stays and is never a task.                                     |
| `version`, `preversion`, `postversion`                                                              | Hooks around `npm version`.                                                                                                                                       |
| `pre<x>`, `post<x>` for any script `<x>`                                                            | Run automatically around `<x>` unless `enable-pre-post-scripts` is off. A task id that starts with `pre` or `post` plus another script's name is therefore wrong. |
| `test`, `start`, `stop`, `restart`                                                                  | Shortcuts (`pnpm test`); fine for `test`, which is exactly the suite alias we want.                                                                               |
| `deploy`, `publish`, `audit`, `install`, `add`, `update`, `link`, `pack`, `exec`, `store`, `doctor` | pnpm built-in commands: `pnpm deploy` runs pnpm's own `deploy`, not the script. The script is reachable only as `pnpm run deploy`.                                |

What it means for this vocabulary:

- **`publish` is reserved and is not a task id.** The task is `release`, which npm and pnpm give no meaning. The
  registry gets a `RESERVED_SCRIPT_NAMES` set (the lifecycle words above) and the validation below fails any package
  that defines a script by one of them, other than the allowed `prepare` at the root. `prepare` can never become a task.
- **`deploy` is the remaining trap.** `apps/sentinel` already has a `delivery.deploy` script; as `deploy` it is called
  with `pnpm run deploy` or `holocron run deploy` and never `pnpm deploy`. The generated README development table
  (`sync-readme`) must print `pnpm run <script>` for any script on the pnpm built-in list, not `pnpm <script>`.
- **`test` is safe and wanted**: the root `test` script is the suite entry point.

## Scripts: exactly what carries what

The script bodies differ by repo type, and they are generated (`repo sync`, `syncScripts`) from one rule that lives in one
place: `scriptsFor(config, registry)` in astromech, next to the `turbo.json` generator, which is the same function the
validation uses. A hand edit that disagrees is a `probe generated check` failure. The rule, by repo type:

| Repo type                                                       | Root scripts call                                                      | Suites are                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| Monorepo with a `turbo.json` (holocron, the monorepo templates) | `turbo run <id>` (the real tool command for a repo-scoped leaf, below) | aggregator tasks in the generated `turbo.json` |
| Single package, no turbo                                        | `holocron run <task>` (the CLI comes from the registry install there)  | the runner (`holocron run <suite>`)            |

Why turbo directly in a monorepo: `holocron` is built from this repo, so on a fresh clone its bin does not exist until
the CLI is built (a fresh worktree here had no `node_modules/.bin/holocron` after install), while turbo is an ordinary
devDependency. Scripts that need the CLI to exist would fail the first `pnpm test` of a new contributor. `holocron run`
stays the CLI and CI front door and already prefers `turbo run` when `turbo.json` defines the task, so the two never
disagree.

### Suites as turbo tasks (tried, works)

The generator writes each suite as a task with no script of its own that `dependsOn` its leaves:

```json
{
  "tasks": {
    "test:unit": {},
    "lint:code": {},
    "//#lint:markdown": {},
    "test": { "dependsOn": ["test:unit"] },
    "lint": { "dependsOn": ["lint:code", "//#lint:markdown"] }
  }
}
```

Tried on a throwaway workspace with the repo's turbo: colon task names work as keys, in `dependsOn` and on the command
line; `turbo run test` ran each package's `test:unit` and ran nothing for `test` itself, because no package has a `test`
script; a package without the leaf's script is skipped, not an error; `turbo run lint` ran `lint:code` in the packages
that have it and the root's `lint:markdown` through the `//#` key. `--filter` that matches no package prints "No tasks
were executed" and exits 0. Not tried: the interaction of `--affected` with a suite, and caching of the `//#` root tasks.

### Root `package.json` (monorepo with turbo)

A root script exists for each task the repo lists in `tasks:` that can run locally, plus each suite with at least one such
member. The body depends on the leaf's scope:

```json
{
  "build": "turbo run build",
  "typecheck": "turbo run typecheck",
  "test": "turbo run test",
  "test:unit": "turbo run test:unit",
  "lint": "turbo run lint",
  "lint:code": "turbo run lint:code",
  "lint:markdown": "markdownlint-cli2 \"**/*.md\"",
  "lint:editorconfig": "editorconfig-checker",
  "format": "prettier --write ."
}
```

- **A package-scoped leaf or a suite** (`build`, `typecheck`, `test:unit`, `lint:code`, `test`, `lint`) is `turbo run <id>`.
- **A repo-scoped leaf with a local tool** (`lint:markdown`, `lint:editorconfig`, `lint:data`, `lint:unused`,
  `scan:secrets`, `format`) holds the real tool command at the root, with a `//#<id>` key in `turbo.json` so a suite can
  depend on it. It is not `turbo run <id>`, which would call itself.
- **A CI-only leaf** (`scan:code`, `lint:commits`, `release`, ...) has no script.
- `pnpm test unit` is not valid here: there is no qualifier word in a turbo script. Use `pnpm test:unit`. The spaced form
  is a `holocron run` feature (`holocron run test unit`), and pnpm appends extra arguments (`pnpm test:unit --watch`), so
  there is no `$1`.
- **`format` writes** (`prettier --write .`). The read-only form is `holocron run format --check`, or
  `prettier --check .`; whether prettier accepts `--check` appended to a `--write` script was not tried and is not relied on.
- `deps`, `deps:check`, `holocron` (`node cli/cli/dist/cli.mjs`) and `prepare: husky` are unchanged and are not tasks.

### Root `package.json` (single package, no turbo)

The same ids, with the CLI as the front door, because there is no turbo to call and the CLI is a normal dependency of
that repo: `"test": "holocron run test"`, `"test:unit": "holocron run test unit"`, `"lint": "holocron run lint"`,
`"lint:code": "holocron run lint code"`, `"format": "holocron run format"`, `"typecheck": "holocron run typecheck"`.
`pnpm test --watch` appends to it. A repo like this has no packages, so there are no leaf scripts to recurse into: the
runner runs the tools from its registry.

### Each package's `package.json`

| Script                                                          | Value                                                      | Owner                    |
| --------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------ |
| `build`                                                         | the build tool (`tsdown`)                                  | the package (validated)  |
| `typecheck`                                                     | `tsc --noEmit`                                             | the package (validated)  |
| `test:unit`                                                     | `vitest run --coverage` (or `node --test ...` in `skills`) | the package (validated)  |
| `lint:code`                                                     | `eslint .`                                                 | the package (validated)  |
| `test:watch`                                                    | `vitest`                                                   | dev script, hand-written |
| `deploy`, `deploy:preview`, `validate:plugin`, `dev`, `preview` | their own commands where the package has them              | the package              |

- A package carries a leaf script only for a leaf it takes part in. **No suite aliases** (`test`, `lint`) in a
  package of a turbo repo: turbo runs every package's script of the name it is asked for, so a package `test` script
  would be run by `turbo run test` as well as the aggregator (tried: it ran), and one that called turbo would loop. This
  reverses the earlier draft, which generated them. A contributor inside a package uses the leaf (`pnpm test:unit`).
- Repo-scoped leaves never appear in a package; they run from the root.
- The dev scripts are a short fixed list (`dev`, `preview`, `test:watch`) that is neither a task nor a check.
- **Coverage is in the script**, not a flag: `test:unit` is `vitest run --coverage` (the shared vitest config is the
  alternative home; open question 4). The registry's `flags: { vitest: ["--coverage"] }` org default and the root's
  `-- --coverage` are removed, so no caller passes it.
- `repo sync` migrates an old dotted key to the new one in place when its value is untouched, and reports one that was
  edited. Today `syncScripts` is `false` in this repo (`astromech.config.ts`); it is turned on here by the phase that
  adds `scriptsFor`, because the root scripts above are now computed.

### The recursion hazard

`pnpm test` at the root runs `turbo run test`, which runs the `test` aggregator, which runs each package's `test:unit`
script. A loop needs a script that sends the chain back into turbo or the CLI. Rules:

1. **A package leaf script holds the real tool command.** It never calls `holocron run` or `turbo run`:
   `"test:unit": "turbo run test:unit"` in a package would run turbo, which would run that same script. The validation
   rejects a leaf value that starts with either.
2. **Root suite and package-scoped leaf scripts call turbo; a repo-scoped leaf's root script holds its tool.** The
   generator computes both, so a hand edit that makes a root script call itself is caught.
3. **A suite name is a turbo task with no script.** No package may have a script named like a suite (`test`, `lint`,
   `scan`, `validate`); the validation fails it. Otherwise `turbo run test` runs that script too.
4. **A `//#<id>` key exists only for a repo-scoped leaf.** A `//#test:unit` key would make root `test:unit` call itself;
   the generator never writes one and `probe generated check` fails on it.
5. **In a single-package repo `holocron run <suite>` resolves to leaves, and the runner never looks up a package script
   named like a suite** (its "use the package's script of that name" fallback does not apply to a suite).

### The README development table

`sync-readme` builds each package's `holocron:development` table from its real `scripts`, in this order: the leaves, then
the dev scripts. Each row shows the command (`pnpm test:unit`, or `pnpm run deploy` for a pnpm built-in) and the
equivalent `holocron run ...`. It fails (not warns) when a row names a script the package lacks, and the generated block
is checked by `probe generated check`, so a package whose README lists `pnpm test` without a `test` script is caught
(the problem #1262 started from). The root README lists the suites and the leaves.

### The check that keeps them aligned

`holocron probe generated check` (or a sibling probe in the same required check) fails when a package script is a dotted
old name, is a reserved name, is named like a suite, is neither a known id (in its script spelling) nor a dev script,
breaks a recursion rule, differs from what `scriptsFor` would write, or is leaf-shaped with an id not in the registry
(so `test:unt` is caught).

## What each other surface looks like

### CLI

`holocron run <id>`, `holocron run <suite> [<qualifier>]`, `holocron run ci`. `holocron run --help` lists the suites with
their leaves grouped under the six intent groups. The old dotted names are accepted for a window (see "Deprecation").

### `holocron.config.ts` `tasks:`

Entries use ids: `{ name: "lint:code", required: true }`. A suite name is not valid in `tasks:` (list the leaves; a leaf
in the list is what makes its workflow and check exist). Old names are accepted and normalized for the window.

### `turbo.json`

Generated from the registry (`cli/astromech/src/generators/turbo`): keys are the package-scoped ids in their script
spelling (`deploy:preview`), a `//#<id>` key per repo-scoped leaf with a local tool, and one aggregator task per suite
that `dependsOn` its leaves (see "Suites as turbo tasks"). `dependsOn` for the leaves is `["build", "^build"]` where it
was `["delivery.build", "^delivery.build"]`, and the per-package override in `holocron.config.ts` becomes
`@theholocron/eslint-config#build`. `holocron probe generated check` already fails on a stale `turbo.json`.

**Gotcha.** Turbo runs `build` in every package that has a `build` script. `docs/package.json` has `build`
(`astro build --root ..`), which `delivery.build` never touched. Renamed tasks would start building the docs site in
every `turbo run build` and in the `build` check. That script becomes `build-docs`, matching `deploy-docs`; `dev` and
`preview` stay, since no task has those ids.

### Workflows

- **Workflow `name:` is the id**: `test:unit`, `deploy-preview`. The six group names (`Verification`, `Source Quality`,
  `Security`, `Delivery`, `Platform`, `Knowledge`) are no longer `name:` values.
- **Caller job `name:` is the id too**, so the check context is `<id> / <called job name>`. Called job names (the text
  after the slash) are unchanged except where a workflow is split, which keeps the diff to one segment per check. With
  the aggregate check (below) the called job names no longer matter to any ruleset.
- **Caller file** in a repo is the flattened `<id>.yml`. In holocron, where a caller and a reusable cannot share a name in
  one folder, the caller keeps its `ci.` prefix (`ci.test-unit.yml`, decided in #1215) and calls
  `./.github/workflows/test-unit.yml`.

## `format` is an action in CI, not a leaf

The repo is the source of truth, and it shows that the CI side of formatting is not a task of its own:

- `sourceQuality.formatting.yml` is one workflow with one job that runs `holocron run sourceQuality.formatting`, which
  runs prettier, editorconfig-checker and markdownlint in **check mode** (`LinterDef.localArgs` is "never --write /
  --fix"), and then an optional step calls the composite action `ci/actions/auto-commit`.
- That step is the "auto-commit-fix" of #675. It is off unless the caller passes `enable-auto-commit: true`, needs the
  `SUPER_LINTER_APP_ID` and `SUPER_LINTER_PRIVATE_KEY` secrets, and runs only on a same-repository pull request that is
  not on the default branch. holocron's own caller does not pass it. `sourceQuality.staticAnalysis.yml` carries the same
  input and step, and `platform.repoSync.yml` calls the same action. So the reusable piece is the action
  `ci/actions/auto-commit`, shared by three workflows.

So `format` gets **no workflow file, no caller, no check name and no required context of its own**:

- In the registry it is a leaf with a local runner (`prettier --write .`, or `--check`) and no CI template. Husky and
  lint-staged (pre-commit) stay the first line, as today.
- What exists in CI today for prettier stays, unchanged in behavior: the check, and the opt-in auto-commit-fix. The
  prettier check and the auto-fix step are two steps that other workflows already know how to host. This spec places them
  as a composite action `ci/actions/format` (the `holocron run format --check` step plus the existing `auto-commit`
  step, with the same inputs, conditions and App-token handling as today) called from the **`lint:code`** workflow,
  which already carries `enable-auto-commit` and the same App-token step. Its check is then `lint:code / ...`.
- `lint:editorconfig` and `lint:markdown` are split out of the old formatting workflow and are ordinary leaf workflows
  with their own checks, because they are linters and fit decision 3.
- Nothing about whether the auto-fix is enabled in any repo changes.

**Not confirmed from the repo**, to be settled before the phase that does it: (a) that no repo sets
`enable-auto-commit: true` for formatting (holocron's own does not; the 7 others' callers were not read); (b) whether
the linters ever write files in CI, since the registry runs them in check mode and `auto-commit` commits only what the
workspace has changed, so the auto-fix may be dormant today; (c) the host (`lint:code`) is this spec's choice, and the
alternatives are a platform workflow or leaving prettier in `lint:editorconfig`'s workflow (open question 1).

## The aggregate required check

Today a ruleset lists 13 contexts, each of the form `<caller job> / <called job>`, matched as exact strings. Every
rename, split or workflow addition orphans one in every repo until its ruleset is resynced (#1547). This spec ends that.

**One required check per repo, `ci`**, replaces every per-task context and the `codecov/*` statuses. `holocron repo
setup` writes a ruleset of `ci` and `DCO`. `DCO` stays its own required context: it comes from the DCO app, not from this
repo's workflows, and a missing sign-off should be named by itself, not by the aggregate. The per-task checks still run
and still show on the PR; they are no longer individually required.

### What `ci` does

A reusable workflow `ci` (`ci/workflows/ci.yml`) with one job, called by a thin caller on `pull_request` (and
`merge_group` if used). Its input `expected` is the list of ids the repo marks `required: true` in `tasks:`, plus
the hand-written ones, generated from the same list `requiredChecks()` reads today.

1. It polls the Checks API for the head SHA until every expected id has at least one check run whose name starts with
   `<id> / ` and every such run has completed, or the timeout (default 30 minutes) passes. Matching by id prefix and not
   by full string means a called-job rename, or a matrix label, cannot break it.
2. An id with no check run at the timeout fails as "never posted". This is the case where the old setup waited for an
   "expected" check forever.
3. `success`, `skipped` and `neutral` pass; anything else fails.
   3a. **It also waits on `codecov/*`.** Those are commit statuses, not check runs, so a second input `statuses` (the
   `codecov/` entries of `extraRequiredChecks`: `codecov/patch`, `codecov/project`, `codecov/patch/documentation`) is
   polled through the commit-status API, and each must reach `success`; one that is still `pending` keeps it waiting,
   and one that never appears at the timeout fails as "never posted". Codecov posts after the test uploads, so this is
   the long pole of the wait. Not confirmed: that `codecov/patch/documentation` posts on every PR (it depends on the
   docs-coverage workflow), which decides whether it can be in `statuses` for every repo.
4. **Debuggable by construction.** On failure the job summary (`GITHUB_STEP_SUMMARY`) is a table of every expected id
   with its conclusion and a link to the check run, failing ones first. Each failing or missing id is also emitted as an
   `::error title=<id>::<conclusion> <link>` annotation, so the PR's checks tab and the file view show it, and the job's
   exit message names them. A passing run writes the same table, so the summary is the one place to look.
5. Permissions: `checks: read`, `statuses: read`, `contents: read`. It never waits for itself.

**Decided: a polling job.** Sentinel is down (#1100), so it cannot post the check. The job runs from the PR's own
workflow file, not from the default branch, which also matters for the rename: a `workflow_run`-triggered aggregate
would run the default branch's version, which would still expect the old names inside the rename PR and block it.

**Known limitation, accepted:** re-running one failed leaf does not update `ci`, which stays red until `ci` is re-run
too. The summary says so on a failure.

**Documented later option:** once Sentinel is healthy it can post the same check from its webhooks (no idle runner, no
re-run gap). The `ci` context name and the `expected`/`statuses` lists are the contract, so swapping the implementation
changes no ruleset. Not built now.

### The failed-run post must name the job

`platform.notifications.yml` posts `❌ <repo>: <workflow> (<file>) failed on <branch>` and today says nothing about
which job failed. It gains a step that reads the failed run's jobs (`GET /actions/runs/{run_id}/jobs`, needs
`actions: read`) and appends the failing job names and their links (at most five, then "and N more"). The `ci` check
runs on pull requests only, which that workflow ignores, so the aggregate never causes a second post. This is part of
the aggregate work, not optional, and does not depend on the rename.

### How it changes the guard test and the cost of names

- `WORKFLOW_CHECK_CONTEXTS` stops being a ruleset input: `requiredChecks()` returns `["ci", ...extraRequiredChecks]`.
  `required: true` now means "the aggregate waits for it".
- `EXPECTED_CHECK_NAMES` is kept for the leaf checks, because they are what a person reads, but renaming one no longer
  orphans anything.
- **Every later rename, split or added workflow costs no ruleset change.** That is the reason to do this first.

## The `ci/` source layout and the flat output

### Source to output

A leaf's source path is `ci/workflows/<suite>/<leaf>.yml`, or `ci/workflows/<id>.yml` for a leaf in no suite. Two
functions, in one module, are the only place the mapping lives:

- `idFromSource(path)`: strip `ci/workflows/` and `.yml`, replace `/` with `:` (`test/unit` is `test:unit`).
- `workflowFile(id)`: replace `:` with `-` and add `.yml` (`test:unit` is `test-unit.yml`).

| Source                            | Id               | Generated reusable (holocron `.github/workflows/`) | `uses:` from another repo                                    |
| --------------------------------- | ---------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `ci/workflows/test/unit.yml`      | `test:unit`      | `test-unit.yml`                                    | `theholocron/holocron/.github/workflows/test-unit.yml@ci-v1` |
| `ci/workflows/lint/code.yml`      | `lint:code`      | `lint-code.yml`                                    | `.../lint-code.yml@ci-v1`                                    |
| `ci/workflows/lint/markdown.yml`  | `lint:markdown`  | `lint-markdown.yml`                                | `.../lint-markdown.yml@ci-v1`                                |
| `ci/workflows/typecheck.yml`      | `typecheck`      | `typecheck.yml`                                    | `.../typecheck.yml@ci-v1`                                    |
| `ci/workflows/deploy-preview.yml` | `deploy-preview` | `deploy-preview.yml`                               | `.../deploy-preview.yml@ci-v1`                               |
| `ci/workflows/ci.yml`             | `ci`             | `ci.yml`                                           | `.../ci.yml@ci-v1`                                           |

- The mapping is used by the reusable generator, `ci-ref`, the release-group path list (`release.config.ts` builds
  `ciPaths` from `hostedReusableWorkflows()`), and a test that fails if two ids flatten to one name or if a folder is
  not a registry suite.
- The **registry is the source of truth for membership**; the folder must agree and a test fails when it does not.
- `ci/actions/<name>/action.yml` is unchanged except for the one new action, `ci/actions/format` (above). Composite
  actions are referenced by path and are not workflows.
- Callers in a repo are not grouped: GitHub reads only `.github/workflows/*.yml`.

### Effect on the generators

- **`WORKFLOW_TEMPLATES` / `KNOWN_WORKFLOWS`** (`github-action-thin-callers.ts`) are keyed by id, and the per-template
  `import` lines become one glob over `ci/workflows/**`; the id comes from the path, not from a hand list.
- **`ci-ref`.** `TEMPLATE_HOME` and the `REFERENCE` regex (`[\w.-]+`) already match hyphenated file names, so `rehome`,
  `rehomeAll`, `reusableWorkflowRef` and `localize` need no logic change. What changes is that the templates are written
  against the flattened name, so a template calls `.../test-unit.yml@main` and `rehome` turns it into `@ci-v1`. A test
  pins that no `rehome`d output contains a dotted legacy name.
- **Legacy names while `CI_HOME` points at `.github`.** Until `CI_HOME` flips to `ci-v1`, the repos outside holocron still
  call the frozen copies in `theholocron/.github`, which have the _old_ file names and exist only there. The generator
  keeps emitting the old caller (file name, `uses:` target, workflow and job name) for any `CI_HOME` whose ref is `main`,
  from a `LEGACY_NAMES` table (the old-to-new map below, as code), and the flat form only for `ci-v1`. `LEGACY_NAMES` is
  deleted with the frozen copies (#1216). Those repos get no `ci` aggregate until the flip either.
- **`localize` for holocron itself** maps `.../test-unit.yml@ci-v1` to `./.github/workflows/test-unit.yml`.
- **The `ci-v1` tag group** (#1481, `release.config.ts`): its path set is derived from the reusables, so the renames move
  the same files. The first `ci-v1` contains _only_ flat names; no dotted reusable ever carries that tag.
- **Any `holocron run <task>` inside a workflow step, and any reusable that calls another, uses the id**; a test greps
  `ci/` for the old names.

## Things that read workflow and file names

- **`.github/workflows/platform.notifications.yml`** triggers on `workflow_run` with a `workflows:` list of the six group
  names plus `Token Expiry`, `Deploy`, `Preview`, `Sentinel Deploy`, `Spec discussions`, and branches on
  `workflow_run.path` (`platform.repoSync.yml`, `delivery.previewDeploy.yml`, `delivery.previewCheck.yml`). After the
  rename its list must be the ids that matter and its path tests the flat file names. `workflow_run` fires only from the
  default branch, so this file must change on `alpha` _in the same change_ as the callers or alerts stop silently.
  `doctor notifications` gets a check that every id the file lists exists as a workflow name (and the colon filter
  noted above is tested).
- **`required-checks` / `WORKFLOW_CHECK_CONTEXTS` / `CI_ORDER`** (all in astromech): `CI_ORDER` is re-keyed by id;
  `WORKFLOW_CHECK_CONTEXTS` shrinks to the id prefixes the aggregate matches.
- **Rulesets** in the 8 repos (see migration) and `holocron repo setup`'s `extraRequiredChecks`.
- **Docs and agent text**: `AGENTS.md`/`CLAUDE.md`, `docs/src/content/docs/config.mdx` ("Task vocabulary"),
  `commands/run.mdx`, `run-ci.mdx`, `astromech.mdx`, every package README development block, `.husky/pre-push`
  (`holocron run ci`, unchanged), lint-staged and `configs/` presets (`docsPreset()` / `nodeDocs()`, which still carry the
  pre-#675 vocabulary and must be moved to ids; they ship with the configs group's **next natural release**, not a
  forced one, per the standing note that 8 of its 17 packages are still on `alpha.2`).
- **Codecov**: flag names are package slugs and do not change.

## The guard test that replaces the grouping test

`check-names.test.ts` pins two tables: `EXPECTED_CHECK_NAMES` (every check string) and `EXPECTED_WORKFLOW_NAMES` (which of
the six group names each caller has). The second is the grouping guard and is deleted. In its place:

1. **Identity invariants**, derived, not tabulated: for every template, the workflow `name:` equals its registry id, the
   caller job `name:` equals its id, the job id and the file basename equal `workflowFile(id)`, and (in holocron) the
   caller file is `ci.<flattened id>.yml`. A rename of one without the others fails.
2. **`EXPECTED_CHECK_NAMES` stays**, re-keyed by id, as the record of what each check is called. It is no longer a
   ruleset guard, because only `ci` is required.
3. **Source-layout test**: each `ci/workflows/**` file maps to a unique id that exists in the registry or the
   workflow-only list, its folder is that leaf's suite, and no colon id and hyphen id flatten to the same file.
4. **A vocabulary test**: no id contains a dot or an uppercase letter, none is on `RESERVED_SCRIPT_NAMES`, every leaf has
   a `group` (one of the six) for `--help`, and `format` has no template.
5. **Aggregate test**: the `ci` caller's `expected` equals the ids of the repo's `required: true` tasks, and every one
   of those posts a check whose name starts with `<id> / `.
6. **Script tests**: the recursion rules and the package script table above.

## Old to new: the complete map

### Tasks, workflow files, caller names

The generated holocron caller is `ci.<flattened id>.yml`; the reusable is `<flattened id>.yml`. "Old file" is both
`.github/workflows/<old>.yml` (reusable) and `ci.<old>.yml` (holocron caller). Workflow `name:` is the id.

| Old task / key                                                          | New id              | Old file                                                 | New file (reusable)                           | Old workflow `name:` |
| ----------------------------------------------------------------------- | ------------------- | -------------------------------------------------------- | --------------------------------------------- | -------------------- |
| `verification.unitTests`                                                | `test:unit`         | `verification.unitTests.yml`                             | `test-unit.yml`                               | Verification         |
| `verification.visualRegression`                                         | `test:visual`       | `verification.visualRegression.yml`                      | `test-visual.yml`                             | Visual Regression    |
| `verification.performance`                                              | `test:perf`         | `verification.performance.yml`                           | `test-perf.yml`                               | Verification         |
| `verification.typeSafety`                                               | `typecheck`         | `verification.typeSafety.yml`                            | `typecheck.yml`                               | Verification         |
| `sourceQuality.staticAnalysis`                                          | `lint:code`         | `sourceQuality.staticAnalysis.yml`                       | `lint-code.yml`                               | Source Quality       |
| `sourceQuality.formatting` (editorconfig-checker)                       | `lint:editorconfig` | `sourceQuality.formatting.yml`                           | `lint-editorconfig.yml`                       | Source Quality       |
| `sourceQuality.formatting` (markdownlint)                               | `lint:markdown`     | same file                                                | `lint-markdown.yml`                           | Source Quality       |
| `sourceQuality.formatting` (prettier)                                   | `format`            | same file                                                | none (action `format`)                        | Source Quality       |
| `sourceQuality.structuredDataValidation`                                | `lint:data`         | `sourceQuality.structuredDataValidation.yml`             | `lint-data.yml`                               | Source Quality       |
| `sourceQuality.deadCodeAnalysis`                                        | `lint:unused`       | `sourceQuality.deadCodeAnalysis.yml`                     | `lint-unused.yml`                             | Source Quality       |
| `platform.commitStandards`                                              | `lint:commits`      | `platform.commitStandards.yml`                           | `lint-commits.yml`                            | Platform             |
| `security.secretDetection`                                              | `scan:secrets`      | `security.secretDetection.yml`                           | `scan-secrets.yml`                            | Security             |
| `security.codeScanning`                                                 | `scan:code`         | `security.codeScanning.yml`                              | `scan-code.yml`                               | Security             |
| `security.tokenExpiry`                                                  | `check-tokens`      | `security.tokenExpiry.yml`                               | `check-tokens.yml`                            | Token Expiry         |
| `delivery.build`                                                        | `build`             | `delivery.build.yml`                                     | `build.yml`                                   | Delivery             |
| `delivery.bundleSize`                                                   | `measure-bundle`    | `delivery.bundleSize.yml`                                | `measure-bundle.yml`                          | Delivery             |
| `delivery.publish`                                                      | `release`           | `delivery.publish.yml`                                   | `release.yml`                                 | Delivery             |
| `delivery.deploy`                                                       | `deploy`            | `delivery.deploy.yml`                                    | `deploy.yml`                                  | Delivery             |
| `delivery.previewDeploy`                                                | `deploy-preview`    | `delivery.previewDeploy.yml`                             | `deploy-preview.yml`                          | Delivery             |
| `delivery.previewCheck`                                                 | `check-preview`     | `delivery.previewCheck.yml`                              | `check-preview.yml`                           | Delivery             |
| `platform.repoValidation` (job `adrs`)                                  | `validate:specs`    | `platform.repoValidation.yml`                            | `validate-specs.yml`                          | Platform             |
| `platform.repoValidation` (job `docsPresence`, alias `docsEnforcement`) | `validate:docs`     | same file                                                | `validate-docs.yml`                           | Platform             |
| `platform.repoSync`                                                     | `sync-repo`         | `platform.repoSync.yml`                                  | `sync-repo.yml`                               | Platform             |
| `platform.syncTemplates`                                                | `sync-templates`    | `platform.syncTemplates.yml`                             | `sync-templates.yml`                          | Platform             |
| `platform.notifyCheck`                                                  | `check-notify`      | `platform.notifyCheck.yml`                               | `check-notify.yml`                            | Platform             |
| `platform.dispatchedCheck`                                              | `check-dispatched`  | `platform.dispatchedCheck.yml`                           | `check-dispatched.yml`                        | Dispatched Check     |
| `knowledge.wiki`                                                        | `publish-wiki`      | `knowledge.wiki.yml`                                     | `publish-wiki.yml`                            | Knowledge            |
| `knowledge.docs`                                                        | `deploy-docs`       | `ci.knowledge.docs.yml` (caller; reusable `preview.yml`) | `ci.deploy-docs.yml` (reusable `preview.yml`) | Deploy / Preview     |
| `knowledge.components`                                                  | `deploy-components` | via `preview.yml`                                        | via `preview.yml`                             | Deploy / Preview     |
| (new)                                                                   | `ci`                | none                                                     | `ci.yml`                                      | none                 |
| `bookkeeping`                                                           | `label`             | `bookkeeping.yml`                                        | `label.yml`                                   | Platform             |
| `greetings`                                                             | `greet`             | `greetings.yml`                                          | `greet.yml`                                   | Platform             |
| `stale`                                                                 | `mark-stale`        | `stale.yml`                                              | `mark-stale.yml`                              | Stale                |
| `dependencies`                                                          | `update-deps`       | `dependencies.yml`                                       | `update-deps.yml`                             | Platform             |
| `review`                                                                | `annotate`          | `review.yml`                                             | `annotate.yml`                                | Source Quality       |
| `preview`                                                               | `preview`           | `preview.yml`                                            | `preview.yml`                                 | Preview              |

Hand-written workflows: `sourceQuality.dependencyCatalogs.yml` to `validate-deps.yml`, `sourceQuality.generatedFiles.yml`
to `validate-generated.yml`, `sourceQuality.docsCoverage.yml` to `validate-api-docs.yml`, `platform.notifications.yml`
to `notify.yml`, `platform.doctorReminder.yml` to `remind-doctor.yml`, `knowledge.specsToIdeas.yml` to
`sync-specs.yml`, `sentinel.deploy.yml` to `deploy-sentinel.yml`, `sentinel.secretsSync.yml` to
`sync-sentinel-secrets.yml`. `setup.yml`, `sync-github.yml`, `tag.yml`, `sync-dispatch.yml` are unchanged. The old
`theholocron/.github` repo also has an unrelated hand-written `release.yml`; it lives in another repo and is frozen, so
there is no clash with the new `release.yml`, but docs must not blur the two.

### Check contexts

The check names stay `<caller job> / <called job>`. With the aggregate they are no longer required one by one, so this
table is what changes in the ruleset **once**, and what a person sees.

| Old required context (holocron ruleset today)                     | New check the aggregate waits on                                                                                                 | Fate in the ruleset             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `Typecheck / Run tsc --noEmit`                                    | `typecheck / Run tsc --noEmit`                                                                                                   | replaced by `ci`                |
| `Static Analysis / Run eslint and actionlint`                     | `lint:code / Run eslint and actionlint` (+ prettier via action)                                                                  | replaced by `ci`                |
| `Formatting / Run prettier, editorconfig-checker, markdownlint`   | `lint:editorconfig / Run editorconfig-checker` and `lint:markdown / Run markdownlint` (prettier moves into `lint:code`'s action) | replaced by `ci`                |
| `Structured Data Validation / Run yamllint`                       | `lint:data / Run yamllint`                                                                                                       | replaced by `ci`                |
| `Secret Detection / Run gitleaks`                                 | `scan:secrets / Run gitleaks`                                                                                                    | replaced by `ci`                |
| `Commit Standards / Run commitlint`                               | `lint:commits / Run commitlint`                                                                                                  | replaced by `ci`                |
| `Repo Validation / Conclusion`                                    | `validate:specs / Validate ADRs and specs` (and `validate:docs`, which warns)                                                    | replaced by `ci`                |
| `Test / Conclusion`                                               | `test:unit / Conclusion`                                                                                                         | replaced by `ci`                |
| `Build / Build every workspace`                                   | `build / Build every workspace`                                                                                                  | replaced by `ci`                |
| `Dead Code Analysis / Run knip`                                   | `lint:unused / Run knip`                                                                                                         | replaced by `ci`                |
| `Audit the Bundle Size / Upload bundle stats to Codecov`          | `measure-bundle / Upload bundle stats to Codecov`                                                                                | replaced by `ci`                |
| `Dependency catalogs / Check`                                     | `validate:deps / Check`                                                                                                          | replaced by `ci`                |
| `Generated files / Check`                                         | `validate:generated / Check`                                                                                                     | replaced by `ci`                |
| (new)                                                             | `ci`                                                                                                                             | the one required context        |
| `codecov/patch`, `codecov/project`, `codecov/patch/documentation` | the same statuses, polled by `ci` (`statuses` input)                                                                             | replaced by `ci`                |
| `DCO`                                                             | unchanged                                                                                                                        | stays required, its own context |

The not-required checks follow the same one-segment rule (`Release / Semantic release` to `release / Semantic release`,
`Deploy / Deploy` to `deploy / Deploy`, `Code Scanning / Analyze (...)` to `scan:code / Analyze (...)`,
`Preview Check / ...` to `check-preview / ...`); `EXPECTED_CHECK_NAMES` carries the full list. Until the `validate`
split (a later phase), `Repo Validation / Conclusion` becomes `validate / Conclusion` and the aggregate waits on `validate`.

### npm scripts

| Old script (every package unless noted)                       | New script                                                                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `delivery.build`                                              | `build`                                                                                                                                                    |
| `sourceQuality.staticAnalysis`                                | `lint:code`                                                                                                                                                |
| `verification.typeSafety`                                     | `typecheck`                                                                                                                                                |
| `verification.unitTests` (`vitest run`)                       | `test:unit` (`vitest run --coverage`)                                                                                                                      |
| `test:watch`                                                  | `test:watch` (unchanged dev script)                                                                                                                        |
| `delivery.deploy`, `delivery.previewDeploy` (`apps/sentinel`) | `deploy`, `deploy:preview` (script spelling of `deploy-preview`)                                                                                           |
| `validate` (16 plugins)                                       | `validate:plugin`                                                                                                                                          |
| `build`, `dev`, `preview` (`docs`)                            | `build-docs`, `dev`, `preview`                                                                                                                             |
| root `build`: `turbo run delivery.build`                      | `turbo run build`                                                                                                                                          |
| root `lint`: `turbo run sourceQuality.staticAnalysis`         | `turbo run lint` (the suite aggregator); plus `lint:code` (`turbo run lint:code`), `lint:markdown` and the other repo-scoped leaves as their tool commands |
| root `test`: `turbo run verification.unitTests -- --coverage` | `turbo run test`; plus `turbo run test:unit` (no `-- --coverage`)                                                                                          |
| root `typecheck`: `turbo run verification.typeSafety`         | `turbo run typecheck`                                                                                                                                      |
| root `format`: `prettier --write .`                           | unchanged                                                                                                                                                  |
| (single-package repos, no turbo)                              | `holocron run <task>` bodies, see "Root `package.json` (single package, no turbo)"                                                                         |
| `skills`: `verification.unitTests` (node --test)              | `test:unit` (same command)                                                                                                                                 |

Root `lint` changes meaning: it ran one leaf and now runs the suite (code, editorconfig, markdown, data, unused,
commits), which is what `pnpm lint` means to a contributor. It is slower; `pnpm lint:code` is the old behavior.

### `holocron.config.ts` and `astromech.config.ts` `tasks:`

| In `holocron.config.ts` / `astromech.config.ts`                                                     | New                                                                 |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `sourceQuality.staticAnalysis` (+ `turbo.dependsOn: ["@theholocron/eslint-config#delivery.build"]`) | `lint:code` (+ `["@theholocron/eslint-config#build"]`)              |
| `sourceQuality.formatting`                                                                          | `lint:editorconfig`, `lint:markdown` (and `format`, local only)     |
| `sourceQuality.structuredDataValidation`                                                            | `lint:data`                                                         |
| `security.secretDetection`, `security.codeScanning`                                                 | `scan:secrets`, `scan:code`                                         |
| `platform.commitStandards`                                                                          | `lint:commits`                                                      |
| `verification.unitTests` (`with: { affected, uploads }`)                                            | `test:unit` (same `with`)                                           |
| `verification.typeSafety`                                                                           | `typecheck`                                                         |
| `delivery.build` (`turbo.passThroughEnv`)                                                           | `build`                                                             |
| `sourceQuality.deadCodeAnalysis`, `delivery.bundleSize`                                             | `lint:unused`, `measure-bundle`                                     |
| `platform.repoValidation` (+ `jobs: { docsEnforcement }`)                                           | `validate:specs`, and `validate:docs` if wanted; `jobs:` is retired |
| `delivery.publish` (`groups`, ...)                                                                  | `release`                                                           |
| `knowledge.docs` (`with: { preview: true }`)                                                        | `deploy-docs`                                                       |
| `review`, `stale`, `greetings`, `dependencies`, `bookkeeping`                                       | `annotate`, `mark-stale`, `greet`, `update-deps`, `label`           |

`with:` keys, `required`, `turbo` overrides and `groups` do not change.

## Migration

### Facts that set the order

- `ci-v1` does not exist and #1478 has not started. Nothing outside holocron calls a flat name yet.
- A check string is written by the _caller_ the generator emits. The callers of the 8 repos can only point at flat
  reusables once those exist at a resolvable ref, which is `ci-v1` (the frozen copies in `.github` keep the old names).
- `ci-v1` is created on a `main` commit, and `main` is 400+ commits behind `alpha` (#1101). The tag waits for the promotion.
- A PR that renames a caller posts only the new contexts, so with per-task required contexts it cannot satisfy the old
  ruleset. The aggregate removes that problem for holocron and, after one swap, for every repo.
- The aggregate runs from the PR's own workflow file, so the PR that changes the expected ids is judged by the new ones.

### Order

1. **Spec accepted** and the phase issues filed (below).
2. **Aggregate first, in holocron (phases G and H).** Land the `ci` reusable, its generator and the notifications
   failing-job step on `alpha` with the _current_ names as the expected ids. Then the one-time ruleset swap for
   holocron: add `ci`, watch it green on a few PRs, remove the 13 per-task contexts. **After this, no rename touches
   the ruleset.** The two pieces are independent of the rename and are an improvement on their own.
3. **Phase A and B (alpha): vocabulary in the registry, CLI, config, turbo and scripts, with aliases.** Nothing posts a
   different check yet. Mergeable on `alpha` with no ruleset work. The CLI and config accept old names (below), so the
   frozen `.github` reusables, which still run `holocron run verification.unitTests`, keep working against a newer CLI.
4. **Phase E and F (alpha): `ci/` regrouped, flat reusables, callers, check names in holocron itself,** plus the
   `format` action and the split of the old formatting workflow. The aggregate's `expected` changes in the same PR; the
   ruleset is untouched. Includes `platform.notifications.yml`, the guard test replacement and the legacy-name gate so
   that the other repos still get old callers.
5. **Phase J (alpha): split `repoValidation` into `validate:specs` and `validate:docs`.** Optional; it can follow
   `ci-v1`, but before it means the 8 repos see one fewer rename.
6. **#1101: alpha is promoted to main.** Nothing above is on `main` until then, so no frozen copy changed. Before the
   promotion's `Sync Templates` run, the freeze of #1477 must be in (`sync github` no longer pushes the moved reusables);
   otherwise it would add flat-named files to `theholocron/.github`, harmless but unreferenced.
7. **`ci-v1` is created** on the promoted `main` commit by the first release of the `ci` group. Only flat names, and
   `ci.yml`, exist at that tag.
8. **Phase K: flip `CI_HOME` to `CI_TARGET` (`ci-v1`) and drop the legacy gate** in one CLI release, then
   `holocron repo sync` opens one PR per repo (#1478): callers renamed and repointed, the `ci` caller added, scripts
   migrated, `tasks:` rewritten. The maintainer merges them one at a time, and each repo's ruleset swaps its per-task
   contexts for `ci` in that sitting.
9. **Phase L: remove the aliases** and `LEGACY_NAMES` once `holocron probe ci refs` reports zero
   `theholocron/.github/.github/` references and the leftover scan (below) is clean (#1216 deletes the frozen copies).

### Cost of required check names

- **Holocron**: one ruleset swap (step 2), done while nothing else is changing, with the old contexts still posting. No
  unmergeable PR, no bypass, no dual-run. Every rename after it is free.
- **The 7 other repos plus the org site**: the swap cannot happen earlier, because the aggregate reaches them only with
  `ci-v1`. Each repo's repoint PR replaces its callers, so it posts the new checks and `ci`, and not the old contexts its
  ruleset still lists. So each needs the maintainer's merge with the ruleset edited around it (replace the per-task
  contexts with `ci`, in the same sitting), once. It is the last time. `holocron repo setup` (strict) writes the
  derived list, so the edit is `repo setup` run once per repo after the merge.
- **What is not affected**: `DCO`, and any check posted by Sentinel. The `codecov/*` statuses leave the ruleset and are
  waited on by `ci`.
- **If the promotion slips**: steps 2 to 5 are still worth landing. Holocron's own checks and ruleset change once, now.

### Deprecation alias

Needed, for two reasons that are independent of the check names: the frozen reusables in `theholocron/.github` run
`holocron run <old id>` and keep doing so until they are deleted (#1216), and `tasks:` in 8 repos' configs and their
`package.json` scripts will not all change on the same day as the CLI.

- **`holocron run <old dotted id>`** resolves through `LEGACY_NAMES` to the new id (`sourceQuality.formatting` to its
  three successors, run in order) and prints a one-line deprecation notice on stderr (it prints in CI too).
- **`tasks:` accepts old names** and normalizes them (`normalizeTaskEntry`), with the same notice from `config show` and
  `doctor`. `holocron repo sync` does not rewrite a TypeScript config; it reports the exact replacement.
- **`repo sync` migrates `package.json` scripts**: a script whose key is an old id is renamed in place when its value is
  untouched; one that was edited is left and reported.
- **Not aliased**: workflow names, file names and check contexts. A check cannot have two names. With the aggregate this
  stops mattering for rulesets, so the only window is the single merge of each repo's repoint PR.
- **How long**: until the leftover scan is clean in all repos and #1216 has deleted the frozen copies, then one more
  minor of the CLI; the alias is removed in a `feat!`/breaking commit.

### Catching leftovers

- **`holocron probe generated check`** (already the required `Generated files / Check`) fails on any stale generated
  file, so a workflow, `turbo.json` or caller still on an old name is caught as drift.
- **A new probe, `holocron probe tasks names`** (it can be a job of the same check) scans the _hand-written_ places
  generation does not own: `tasks:` in `holocron.config.ts` and `astromech.config.ts`, every `package.json` `scripts`,
  README and docs code blocks, `.husky`, lint-staged, hand-written workflows and the reusable `run:` steps. It reports
  each old dotted name with file, line and replacement, as `warn` in the window and `fail` after, plus the reserved-name,
  dev-script and recursion rules. It reads `LEGACY_NAMES`, so it knows exactly what to look for.
- **`holocron doctor` (repo)** compares the ruleset's required contexts with `requiredChecks()`: a context that no
  workflow posts is `stale context`, and one the derived list wants that the ruleset lacks is `missing`. After the
  swap, "the ruleset is `ci` plus the external contexts" is the whole expectation.
- **`holocron doctor notifications`** adds the "every listed workflow exists" check.
- **The `ci refs` scan** from #1473 keeps counting `theholocron/.github/.github/` references; the two scans together say
  when phase L may start.

## Phased plan and issues

Suggested issues. None are created by this spec. Each is one PR unless noted; every PR carries its own tests and docs
(org rule), so there are no "docs follow-up" issues.

| #   | Issue                                                                                             | Depends on           | Notes                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G   | `feat(ci): ✅ one stable required check: the ci aggregate with a failing-job summary`             | spec accepted        | `ci/workflows/ci.yml` (polling job), generator, `expected` from `required: true` and `statuses` from the `codecov/` extras, summary and annotations, `requiredChecks()` returns `ci` and `DCO`, holocron ruleset swap (13 contexts and `codecov/*` to `ci`)                                                        |
| H   | `fix(notifications): 🔔 name the failing jobs in the failed-run post`                             | none                 | `actions: read`, job names and links, max five; independent of every rename                                                                                                                                                                                                                                        |
| A   | `refactor(astromech): 🏷️ flat verb-first task ids and suites in the registry, runner and config`  | spec accepted        | colon ids, suites, `[job]` resolution, `format` leaf, `release`, `LEGACY_NAMES`, aliases in `run` and `tasks:`, `--help` grouping, reserved names, package-scope behavior                                                                                                                                          |
| B   | `refactor(astromech): ♻️ generate turbo.json and package scripts from the flat ids`               | A                    | `scriptsFor` (turbo-direct root scripts, `holocron run` bodies for single-package repos), suite aggregator and `//#` keys in `turbo.json`, `syncScripts` on here, script-spelling colon rule, recursion checks, `sync-readme` check, `pnpm run` for built-ins, `--coverage` flag removed (coverage in `test:unit`) |
| C   | `refactor(repo): ♻️ rename scripts and tasks across this monorepo` (mechanical)                   | A, B                 | 73 packages, root scripts, `docs` `build-docs`, plugin `validate:plugin`, `tasks:` lists                                                                                                                                                                                                                           |
| D   | `feat(cli): ✅ holocron probe tasks names and the doctor ruleset comparison`                      | A                    | leftover detection; lands before C so C is verified by it                                                                                                                                                                                                                                                          |
| E   | `refactor(ci): 🗂️ group ci/ sources by suite and generate flat reusables`                         | A                    | `idFromSource`/`workflowFile`, glob templates, `release.config.ts` paths, layout and uniqueness tests                                                                                                                                                                                                              |
| F   | `refactor(ci): 🏷️ workflow, job and file names are the task id; replace the grouping guard`       | E, G                 | caller generator + legacy gate, `ci.<id>.yml`, `platform.notifications.yml`, identity tests; **no ruleset step** once G is in                                                                                                                                                                                      |
| I   | `refactor(ci): ✂️ split the formatting workflow: lint:editorconfig, lint:markdown, format action` | F                    | the `ci/actions/format` composite (check plus existing auto-commit-fix, unchanged behavior), prettier hosted by `lint:code`                                                                                                                                                                                        |
| J   | `refactor(astromech): ✂️ split repoValidation into validate:specs and validate:docs`              | F                    | drops `jobs:`, `retiredJobs` and the `Conclusion` aggregator                                                                                                                                                                                                                                                       |
| K   | `refactor(ci): 🧭 flip CI_HOME to ci-v1 and repoint the 8 repos on the flat names`                | #1101, `ci-v1`, F, G | this is #1478 with the rename and the aggregate folded in; one PR per repo, one ruleset swap per repo                                                                                                                                                                                                              |
| L   | `chore(astromech): 🔥 remove the dotted aliases and LEGACY_NAMES`                                 | K, #1216             | breaking                                                                                                                                                                                                                                                                                                           |
| M   | `feat(configs): 🧩 presets speak the flat ids`                                                    | A                    | ships with the next natural configs release, not a forced one                                                                                                                                                                                                                                                      |

Docs (`config.mdx` "Task vocabulary", command pages, `AGENTS.md`, READMEs) are part of A, B, C, F and G, each updating
its own part. #1547 is subsumed by G and F: its "decide the target label per task" is answered here (the id), and its
ruleset-migration recipe is replaced by the one-time swap. #1478 becomes K. #989's taxonomy table is superseded except
for the Sentinel-posted checks.

### Phase A as built (#1615)

Where the spec left room, phase A settled these, so later phases start from them:

- **Generated output is untouched.** The registry is keyed by flat ids, but workflow files, thin-caller job names, check
  contexts, `turbo.json` keys and package scripts are still the old names, reached through `workflowKey()`,
  `legacyName()` and `ownLegacyName()` (an old name that stood for one id; `sourceQuality.formatting` stands for three, so
  none of them owns it). A manifest spelled with either vocabulary generates the same files. Phase B/E/F drop those
  translations as they flip each surface.
- **`normalizeTaskEntry` keeps the authored name.** Consumers compare through `isTask(name, id)` /
  `resolveTaskName(name)` instead, because Sentinel and the other repos' configs still read old names with the same
  function. The deprecation notice is printed by `holocron run` (stderr); `config show` and `doctor` do not print one yet.
- **`validate` is the interim id** of `platform.repoValidation` (it keeps the `adrs` and `docsPresence` jobs, `jobs:` and
  `retiredJobs`), so `validate` is a task, not yet a suite, until phase J splits it. The three suites that exist are
  `test`, `lint` and `scan`.
- **`format` and `ci`.** `format` is `prettier --write .`; `--check` swaps in the registry's `checkArgs` and skips any
  turbo task or package script, since the root script writes. `holocron run ci` runs it with `--check`, and the old
  `sourceQuality.formatting` expands to `lint:editorconfig`, `lint:markdown` and `format --check`, none of which fails
  `ci` for a missing tool the others do not need (it passed when any of its tools ran).
- **Positional words name the task.** The CLI now sends the positionals after the job as `args` (part of the longest match)
  and only what follows `--` as `passthrough`. An unknown flag after a leaf is still rejected by yargs (`.strict()`); use
  `--` (open item for the phase that generates the suite scripts, since pnpm appends arguments without `--`).
- **From a package directory** a suite runs the package-scoped leaves directly (there is no `turbo.json` in that
  directory to delegate to) and reports the repo-wide ones as skipped.

### Phase B as built (#1616)

What phase B settled where the spec left room:

- **The spelling of `turbo.json` keys and package scripts follows the `tasks:` entry, not the registry.** This reverses
  phase A's "a manifest spelled with either vocabulary generates the same files" for these two surfaces only. Flipping the
  keys for every manifest would have broken this repo (and the other seven) the moment phase B merged: the 73 packages still
  hold `verification.unitTests`, so `turbo run test:unit` would find no task and exit 0. `taskKey(entry, id)` gives the
  script spelling for a flat entry and the old name for an entry written with one, so rewriting a repo's `tasks:` (phase C
  here, phase K elsewhere) is what moves its turbo keys, package scripts and root scripts together. Workflow files, caller
  job names and check contexts are untouched (still `workflowKey()`).
- **`scriptsFor(config, registry, { monorepo })`** returns the task scripts only (`holocron` and `prepare` stay with
  `packageScripts()`). "Monorepo" is a `pnpm-workspace.yaml` next to the config plus a `turbo.json` that would be generated.
  Root scripts in one are named by the flat id, whatever the entry's spelling (`test:unit` calls `turbo run
verification.unitTests` while the entry is old). A single package keeps an old-named entry's `holocron run <name> --`
  wrapper as it was and gets no suite scripts until its list is flat; with flat entries it gets `holocron run test unit --`
  and the suite script `holocron run test --`. The trailing `--` stays: pnpm appends arguments as typed and yargs is strict.
- **A leaf with no local command has no script in a workspace**, and neither does a holocron subcommand (`sync-repo`,
  `validate`, `publish-wiki`, `check-tokens`) or a set of sub-jobs: a root script that called `holocron run` would loop
  through the runner's script step, and those tasks need the CLI anyway.
- **`//#<id>` keys are `cache: false`** (the spec's example is `{}`): a root task is hashed from the root package's files
  only, so a cached `//#lint:markdown` would pass on a stale hash after a package's markdown changed. They exist only for a
  repo-scoped leaf that belongs to a suite; `format` has none.
- **The runner prefers the registry to the generated root script** of a repo-scoped leaf, so `holocron run ci` on a machine
  without `yamllint` still reports "not on PATH (enforced in CI)" instead of failing a `pnpm run`. `pnpm lint` itself, being
  the generated script, needs the tools of its leaves installed (editorconfig-checker, markdownlint-cli2, yamllint, knip).
- **Coverage.** `test:unit` is `vitest run --coverage` in the registry and no flag exists. The 73 package scripts are
  `vitest run --coverage` since phase C (#1617), which removed the `legacyForward` field and its runner branch.
- **The check** (`checkScripts()` in the `generated` probe, built on `checkPackageScripts()` and `mergeScripts()` in
  astromech): fails a differing root script, a reserved name (other than the root's `prepare`), a package script named like a
  suite, a package leaf that calls `turbo run` or `holocron run`, and a `test:unt`-shaped name under a suite
  (`test:watch` and `lint:fix` are variants). A dotted old name is one `info` line for the whole repo, not a failure, until
  phase L. The spec's "neither a known id nor a dev script" rule is not enforced as written, since it would fail every
  package's own scripts.
- **`mergeScripts`** keeps #747's guard: a root script that holds a real command for a task turbo fans out is left alone.
  The generated bodies (`turbo run …`, `… run … --`) are recognized by shape (`isGeneratedScript`).
- **README table.** Columns are `Script | Command | Same as`; suites and leaves in registry order, then dev scripts, and `pnpm
run <script>` for the pnpm built-ins. `repo sync` fails the `readme` step when the README names `pnpm <task>` for a task or
  suite script the package lacks (`pnpm deploy` alone is pnpm's own command and is not read as the script).
- **This repo.** `syncScripts` is on with `holocronScript: "node cli/cli/dist/cli.mjs"`, which also changes the generated
  `.husky/commit-msg` and `.husky/pre-push` to call it instead of `pnpm exec holocron`.

### Phase E as built (#1619)

- **Sources** moved to `ci/workflows/<suite>/<leaf>.yml` or `ci/workflows/<id>.yml`; the thin-caller templates mirror them
  under `cli/astromech/src/templates/workflows/`. `@theholocron/ci` builds `WORKFLOWS` (keyed by id) with one
  `import.meta.glob` and `idFromSource()`; astromech does the same for `WORKFLOW_TEMPLATES`, keyed by `workflowKey(id)`
  (the old name until phase F, which keys it by id). The per-file `*.yml.d.ts` of the templates are gone.
- **`idFromSource` and `workflowFile`** are two files in `ci/src/` (one function per file), not one module. `idFromSource`
  strips everything up to `workflows/`, so it reads a repo path, the glob key and a templates path alike.
- **Templates are written against the flat name** (`.../test-unit.yml@main`). `rehome` spells it with the old name for a
  `main` home (`legacyFile`, the first successor of each `LEGACY_NAMES` entry, so `sourceQuality.formatting` is carried by
  `lint:editorconfig`) and leaves it flat for `ci-v1`; `localize` turns either into `./.github/workflows/<flat>.yml`
  (`flatFile`). `reusableWorkflowRef` takes the flat name.
- **`theholocron/.github` keeps the old names** for everything `sync github` pushes or stamps (`frozenReusablePaths`,
  `reusableTemplates`): Sentinel dispatches `platform.dispatchedCheck.yml` by name there.
- **`release.config.ts`** builds `ciPaths` from `workflowFile(id)` of `hostedReusableWorkflows()` (now keyed by id).
- **Not done here:** `task:` inputs inside the reusables still hold the old names (`sourceQuality.formatting` runs three
  successors, so it cannot take one id yet), and the one-source-per-leaf split of the formatting and validate workflows
  waits for its phase.
- **Tests:** `ci-layout.test.ts` (unique ids, no two ids flatten to one file, the folder is the registry suite), the
  `rehome` and `localize` tests for both spellings, and the hosted-reusables test for the grouped source header.

### Phase F as built (#1620)

- **Names are the id.** Every template under `cli/astromech/src/templates/workflows/` has `name: <id>`, one job per file
  named `workflowFile(id)` without `.yml` (`test-unit`) and `name: <id>`; the wiki's second job is `publish-wiki-preview`, and
  the generated combined deploy caller (`deploy`, `deploy-docs`, `deploy-components`) has `<id>` and `<id>-preview`, both
  named `<id>`. The grouped release names its matrix job `release ${{ matrix.group }}`. In holocron the file is
  `ci.<workflowFile(id)>` (`ci.test-unit.yml`), the `ci` aggregate caller is `name: ci`.
- **`workflowKey(name)` is the flat id** of the template that carries the name's workflow: an old name maps to its first
  successor, `lint:markdown` and `format` to `lint:editorconfig`. `WORKFLOW_TEMPLATES`, `KNOWN_WORKFLOWS`,
  `WORKFLOW_CHECK_CONTEXTS` and the keys of `thinCallers()` are all by id.
- **The legacy-name gate** is `legacyGate()` (true while `CI_HOME.ref` is `main`). A repo that does not host the reusables
  gets `legacyCaller(id, yaml)` (the `LEGACY_CALLERS` table: old workflow name, old job id and name, and the grouped
  release's matrix name) and the file `legacyCallerFile(id)` (`verification.unitTests.yml`), because its ruleset still lists
  the checks those post. The starter workflows `sync github` pushes to `.github` are legacy too. Phase K opens the gate
  (`CI_HOME` to `ci-v1`) and deletes the table with the aliases.
- **Check contexts** are `<id> / <called job>` (`WORKFLOW_CHECK_CONTEXTS`), so the `ci` aggregate's `expected` are the ids
  and match by the prefix `<id> / `; `lint:markdown` and `format` have no context of their own (the formatting workflow is
  listed under `lint:editorconfig`). The hand-written `Dependency catalogs` and `Generated files` keep their names.
- **Reusables** run flat ids in their `task:` inputs, except `lint/editorconfig.yml` (`sourceQuality.formatting`, three
  successors until phase I) and `validate.yml` keeps its two jobs until phase J.
- **`platform.notifications.yml`** lists the ids and tests the flat file names (`ci.release.yml`, `ci.sync-repo.yml`,
  `ci.deploy-preview.yml`, `ci.check-preview.yml`); `doctor notifications` has a third row, `notifications-workflow-names`,
  that fails on an old group name, an old dotted name or an id no task has (`workflowNameProblems`). Not confirmed: that
  GitHub's `workflow_run.workflows` filter matches a colon-bearing name; the first `alpha` run of `test:unit` shows it.
- **Tests:** `check-names.test.ts` now has the identity invariants and the legacy-gate round trip in place of
  `EXPECTED_WORKFLOW_NAMES`; `EXPECTED_CHECK_NAMES` is keyed by id.

## Open questions

Resolved and folded into the decisions: the colon spelling, `format` as a verb, `release`, the aggregate check and its
mechanism (a polling job, with Sentinel posting it as a documented later option), `DCO` separate and `codecov/*` inside
`ci`, hyphen compounds as colon scripts only, no `--coverage` flag, and turbo-direct scripts in turbo repos.

1. **Where prettier's CI check lives.** `format` has no workflow of its own; this spec hosts the existing check and the
   opt-in auto-commit-fix in an action called by `lint:code`. Confirm that, and confirm (see "not confirmed" above) that
   no repo enables the auto-fix and whether the linters ever write in CI.
2. **`preview.yml`.** One reusable for `deploy-docs`, `deploy-components` and the workflow-only `preview`. Keep it as the
   one shared exception to "one file per leaf", or give each its own file?
3. **Sentinel's checks** (`Platform / Compliance / ...`, five lint-split checks) are named by the app. Align them with
   the ids, or leave them under #989? When Sentinel is healthy (#1100), should it post `ci` itself?
4. **Where coverage lives.** The spec puts `--coverage` in each package's `test:unit` script (73 packages are edited for
   the rename anyway). The alternative is `coverage.enabled` in the shared `@theholocron/vitest-config`, one place, but
   it ships with the configs group's next natural release. Which?
5. **No suite alias inside a package.** In a turbo repo a package cannot carry `test` or `lint` (turbo would run it too,
   and it would loop), so `pnpm test` inside a package fails and the contributor types `pnpm test:unit`. Acceptable?
6. **Reading prettier without writing.** The root `format` script writes. Spell the read-only form `holocron run format
--check` only, or add a root `format:check` script (`prettier --check .`)? Also untried: whether `--check` appended to
   a `--write` script works.
7. **Things tried only in part.** The suite aggregator was tried with colon names, a leaf missing from a package, a
   `//#` root task and `--filter`; `--affected` with a suite and the cache behavior of `//#` tasks were not. The
   `workflow_run.workflows` filter with a colon-bearing name was not either, and whether `codecov/patch/documentation`
   posts on every PR decides if it can be in `ci`'s `statuses` everywhere.
8. **The Storybook, interaction and user-flow jobs** inside `test:unit` are gated by `run-*` inputs behind a `Conclusion`
   job, which is the shape decision 3 rules out. Split them into `test:storybook`, `test:a11y` and `test:flow` leaves in a
   later phase, or accept them as jobs?
9. **The `[job]` argument.** `holocron run test unit storybook` needs the longest-match rule; confirm no existing
   `holocron run <task> <job>` call has a job named like a qualifier (only `adrs` and `docsPresence` are used today, and
   both go away with the `validate` split).
10. **The `notify` workflow filter.** Replace the `workflows:` list with the ids, or generate it from the registry so it
    cannot drift?
11. **Does the repoint PR need a ruleset bypass actor** on every one of the 8 repos? The one-time swap in each needs the
    maintainer to be able to merge a PR that posts `ci` and not the old contexts.
