---
id: SPEC-0076
status: proposed
issue: theholocron/holocron#2036
blocked-by: []
related:
  - theholocron/holocron#1547
  - theholocron/holocron#989
discussion:
  url: https://discord.com/channels/1303969001822486568/1569582792445268088
---

# Sentinel check names: `sentinel:<task id> / <Action>`

Supersedes `ci-check-taxonomy-rename` (SPEC-0041, #989). Sentinel's check runs move from three tiers, `Category / Group /
Action`, to two, `<task id> / <Action>`, with a temporary `sentinel:` in front of the task id. The shape is enforced by a
test so it cannot drift.

## Context

The checks that a pull request shows come from two places that name things differently:

- **Actions checks** are named from the workflow files. Since `ci-flat-task-vocabulary` they are two segments, `<task id> /
<step>` (`lint:code / Run eslint, actionlint and prettier`, `typecheck / Run tsc --noEmit`, `ci / Required checks`). The
  top-level workflow `name:` is not part of the context string.
- **Sentinel's checks** are check runs the App creates directly, so each name is one literal string of the author's choosing.
  Thirteen of them have three segments, built from `SENTINEL_NAMESPACES` (`Platform`, `Source Quality`, `Verification`).

The first segment is the old astromech task namespace (`platform.commitStandards`, `sourceQuality.staticAnalysis`). That
vocabulary is retired on the Actions side, nothing reads the segment, and GitHub already shows the posting App's name next
to a check run.

Sentinel is being built out to be the whole CI experience. The Actions checks stay for about a month, to see what Vercel
costs, and are then removed from this repo. Until then both sets of checks exist for the same tasks. The end state is
Sentinel using the plain task ids; the question is how to name its checks during the overlap.

## What Sentinel posts

| Current name                                                  | Does                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `Platform / Compliance / Run Holocron config compatibility`   | declared capabilities against the required baseline      |
| the same, with `(pull_request)`                               | the same check on the pull request branch's config       |
| `Platform / Compliance / Run Developer Certificate of Origin` | sign-off on every commit                                 |
| `Platform / Commit Standards / Run commitlint`                | commitlint over the pull request's commits               |
| `Platform / Repo Validation / Validate ADRs and specs`        | frontmatter rules for ADRs and specs                     |
| `Platform / Repo Validation / Validate docs presence`         | a public change that ships with no docs (a warning)      |
| `Source Quality / Formatting / Run prettier`                  | prettier, with an auto-fix commit                        |
| `Source Quality / Formatting / Run editorconfig`              | editorconfig-checker, with an auto-fix commit            |
| `Source Quality / Documentation / Run markdownlint`           | markdownlint, with an auto-fix commit                    |
| `Source Quality / Inclusive Language / Run alex`              | alex                                                     |
| `Source Quality / Static Analysis / Run eslint`               | eslint                                                   |
| `Source Quality / Static Analysis / Run actionlint`           | actionlint                                               |
| `Verification / Type Safety / Run tsc --noEmit`               | `tsc`, dispatched only for a repo that declares the task |

Most of them repeat an Actions check of the same concern (`lint:commits`, `lint:markdown`, `lint:editorconfig`,
`validate:specs`, `validate:docs`, `typecheck`). They exist so Sentinel can post and auto-fix in a repo with no Actions CI.
Only config compatibility, DCO and alex have no Actions twin (the required `DCO` check is the probot app's, not Sentinel's).

## Options

- **A. `Group / Action`** (`Static Analysis / Run eslint`). Drop the first tier and keep a Title Case concern. Proposed
  first. Dropped: it is a third vocabulary beside the task ids, and the end state is Sentinel on the task ids.
- **B. `<task id> / <Action>`, no prefix** (`lint:code / Run eslint`). The end state. During the overlap it clashes: five
  Sentinel names would equal an Actions check exactly (`lint:commits`, `validate:specs`, `validate:docs`, `lint:markdown`,
  `typecheck`), and the `ci` aggregate takes every check run whose name starts with `"<task id> / "`, treats a running one
  as pending and a failed one as a failure, so a Sentinel check would join the aggregate and become gating by accident.
  Rejected for now.
- **C. `gh:` on the Actions checks.** Frees the plain ids for Sentinel. Rejected: each thin caller's workflow `name:` is its
  task id, so every caller here and in the repos that use them is regenerated; the aggregate would learn the prefix;
  `ci / Required checks` is the ruleset's required context and would be renamed twice (now, and when the prefix goes);
  `platform.notifications.yml` and `doctor notifications` read workflow names as task ids; the frozen reusables in
  `theholocron/.github` keep posting the old names. All of it undone in a month.
- **D. `sentinel:` on Sentinel's checks** (`sentinel:lint:code / Run eslint`). Chosen. No ruleset that could be read requires
  a Sentinel name, and the names come from one builder. The names differ from the Actions ones, and the aggregate's
  `<task id> /` prefix does not match `sentinel:<task id> /`, so Sentinel's checks stay advisory.
- **E. `sentinel / <check>`.** GitHub already shows the App's name, and a hand-added prefix was removed once for duplicating
  it ("The Holocron Sentinel / Sentinel / Platform / …"). Rejected.

## Decision

Sentinel's checks are named `<prefix><task id> / <Action>`, two segments joined by one `/`, built by one function,
`sentinelCheckName(taskId, action)`. The prefix is one constant, `SENTINEL_CHECK_PREFIX` (`"sentinel:"`). The first
segment of today's name goes; `SENTINEL_NAMESPACES` goes with it.

### Names

The task id is the id of the task whose job the check does. `validate:config`, `validate:dco` and `lint:language` are not
registry tasks (nothing on the Actions side has them); they are names, chosen to follow the registry's `<suite>:<leaf>`
shape, and nothing reads them. If the registry gains a task for one, the name already matches.

| Old                                                                        | New                                                                           |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Platform / Compliance / Run Holocron config compatibility`                | `sentinel:validate:config / Run Holocron config compatibility`                |
| `Platform / Compliance / Run Holocron config compatibility (pull_request)` | `sentinel:validate:config / Run Holocron config compatibility (pull_request)` |
| `Platform / Compliance / Run Developer Certificate of Origin`              | `sentinel:validate:dco / Run Developer Certificate of Origin`                 |
| `Platform / Commit Standards / Run commitlint`                             | `sentinel:lint:commits / Run commitlint`                                      |
| `Platform / Repo Validation / Validate ADRs and specs`                     | `sentinel:validate:specs / Validate ADRs and specs`                           |
| `Platform / Repo Validation / Validate docs presence`                      | `sentinel:validate:docs / Validate docs`                                      |
| `Source Quality / Formatting / Run prettier`                               | `sentinel:format / Run prettier`                                              |
| `Source Quality / Formatting / Run editorconfig`                           | `sentinel:lint:editorconfig / Run editorconfig`                               |
| `Source Quality / Documentation / Run markdownlint`                        | `sentinel:lint:markdown / Run markdownlint`                                   |
| `Source Quality / Inclusive Language / Run alex`                           | `sentinel:lint:language / Run alex`                                           |
| `Source Quality / Static Analysis / Run eslint`                            | `sentinel:lint:code / Run eslint`                                             |
| `Source Quality / Static Analysis / Run actionlint`                        | `sentinel:lint:code / Run actionlint`                                         |
| `Verification / Type Safety / Run tsc --noEmit`                            | `sentinel:typecheck / Run tsc --noEmit`                                       |

### The docs check loses "presence"

`Validate docs presence` becomes `Validate docs`, on both sides: Sentinel's `sentinel:validate:docs / Validate docs` and the
Actions check `validate:docs / Validate docs` (the job and step names in `ci/workflows/validate/docs.yml`, the entry in
`WORKFLOW_CHECK_CONTEXTS`, the generated `.github/workflows/validate-docs.yml`). The `validate:docs` task runs
`holocron probe docs validate`, which is `docs presence` (a warning) followed by `docs tokens` (a failure), so "presence"
no longer describes the check. The probe keeps its name, `docs presence`, and so do the `Docs presence: …` summary titles:
they name what the probe measures, not the check.

The `ci` aggregate waits for `validate:docs` by the prefix `validate:docs /`, so the part after the slash does not matter
to it. No ruleset that could be read lists the exact string (`holocron` requires `ci / Required checks` and `DCO`; the
other readable rulesets, including the template repos', hold no `Validate docs` context). A repo on the frozen reusables
keeps posting the old job name from its frozen copy until `CI_HOME` moves.

### Casing

- The **prefix** is `SENTINEL_CHECK_PREFIX`, written once.
- The **task id** is lowercase words joined by `:` or `-` (`lint:code`, `validate:specs`, `deploy-preview`), as in the
  registry.
- The **action** starts with one verb from a closed list, `CHECK_ACTION_VERBS` (`Run`, `Validate`), followed by what it
  acts on. A tool, an acronym or a proper noun keeps its own casing: `Run eslint`, `Run tsc --noEmit`,
  `Validate ADRs and specs`, `Run Developer Certificate of Origin`. A capitalised word that is not on the list (`Eslint
results`, `Static Analysis`) is rejected, so a new verb is a deliberate edit of the list. All 13 current actions start with
  `Run` (11) or `Validate` (2).
- An event suffix is the event's name, in parentheses: `(pull_request)`.

`checkNameProblem()` returns what is wrong with a name (or `undefined`), and a test runs it over every
`SENTINEL_*_CHECK_RUN_NAME` and the dispatched check.

### Removing the prefix

When the Actions checks for these tasks are removed from the repo:

1. Delete the callers and reusables of the tasks Sentinel now runs.
2. Set `SENTINEL_CHECK_PREFIX` to `""`. Names, tests and the rule follow from the constant; the docs that quote names
   need the same edit.
3. In the same change, point the rulesets (and the `ci` aggregate's `expected` list, if it is kept) at the new names. A
   ruleset that lists a prefixed name is the only external thing that breaks.

Step 1 comes first or together with step 2. Without it, two checks of one name exist, and the aggregate, which matches
`<task id> /` by prefix, would count Sentinel's.

## Every check, after this change

### Sentinel's checks (13)

Sentinel handles a push to the default branch, a pull request opening or getting new commits, and a pull request's title or description being edited (only the docs check runs on an edit). "Pull request" below means opened or updated.

| #   | Check                                                                         | Posted when                                                                                                                                                  | Was                                                                        |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 1   | `sentinel:validate:config / Run Holocron config compatibility`                | On a push to the default branch and on a pull request, once the default branch's `holocron.config` loads; nothing is posted for an invalid or missing config | `Platform / Compliance / Run Holocron config compatibility`                |
| 2   | `sentinel:validate:config / Run Holocron config compatibility (pull_request)` | On a pull request, whatever the default branch's config; it reads the config at the pull request's head, so it reports a bad config in the branch            | `Platform / Compliance / Run Holocron config compatibility (pull_request)` |
| 3   | `sentinel:validate:dco / Run Developer Certificate of Origin`                 | On every pull request; needs no config                                                                                                                       | `Platform / Compliance / Run Developer Certificate of Origin`              |
| 4   | `sentinel:lint:commits / Run commitlint`                                      | On every pull request; needs no config                                                                                                                       | `Platform / Commit Standards / Run commitlint`                             |
| 5   | `sentinel:validate:specs / Validate ADRs and specs`                           | On a pull request, only for a repo whose valid config declares the `platform.repoValidation` task                                                            | `Platform / Repo Validation / Validate ADRs and specs`                     |
| 6   | `sentinel:validate:docs / Validate docs`                                      | The same gate as 5, and again when the pull request's title or description is edited                                                                         | `Platform / Repo Validation / Validate docs presence`                      |
| 7   | `sentinel:format / Run prettier`                                              | On every pull request; needs no config                                                                                                                       | `Source Quality / Formatting / Run prettier`                               |
| 8   | `sentinel:lint:editorconfig / Run editorconfig`                               | On every pull request; needs no config                                                                                                                       | `Source Quality / Formatting / Run editorconfig`                           |
| 9   | `sentinel:lint:markdown / Run markdownlint`                                   | On every pull request; needs no config                                                                                                                       | `Source Quality / Documentation / Run markdownlint`                        |
| 10  | `sentinel:lint:language / Run alex`                                           | On every pull request; needs no config                                                                                                                       | `Source Quality / Inclusive Language / Run alex`                           |
| 11  | `sentinel:lint:code / Run eslint`                                             | On a pull request, once the default branch's config loads, and not when the repo's `runtime_environment` property is `none`                                  | `Source Quality / Static Analysis / Run eslint`                            |
| 12  | `sentinel:lint:code / Run actionlint`                                         | On a pull request, once the default branch's config loads                                                                                                    | `Source Quality / Static Analysis / Run actionlint`                        |
| 13  | `sentinel:typecheck / Run tsc --noEmit`                                       | On a push or a pull request, once the config loads, and only for a repo whose config declares `verification.typeSafety`; Sentinel dispatches it              | `Verification / Type Safety / Run tsc --noEmit`                            |

### The Actions side (`<task id> / <step>`)

Only `validate:docs` changes. "Listed" means the check is in `WORKFLOW_CHECK_CONTEXTS`, the list of merge-gating checks a `required` task contributes to the `ci` aggregate.

| Task                               | Check                                                                                                                                                                                                                                                                       | Listed            | Change                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| `typecheck`                        | `typecheck / Run tsc --noEmit`                                                                                                                                                                                                                                              | yes               | unchanged                                                  |
| `build`                            | `build / Build every workspace`                                                                                                                                                                                                                                             | yes               | unchanged                                                  |
| `test:unit`                        | `test:unit / Conclusion`; also `test:unit / Run unit tests and collect coverage`, `… / Run Storybook interaction tests`, `… / Run interactions and accessibility tests`, `… / Run user flow tests`                                                                          | `Conclusion` only | unchanged                                                  |
| `test:visual`                      | `test:visual / Run visual and composition tests`                                                                                                                                                                                                                            | no                | unchanged                                                  |
| `test:perf`                        | `test:perf / Run Lighthouse CI`                                                                                                                                                                                                                                             | yes               | unchanged                                                  |
| `lint:code`                        | `lint:code / Run eslint, actionlint and prettier`                                                                                                                                                                                                                           | yes               | unchanged                                                  |
| `format`                           | no check of its own: a step of `lint:code`                                                                                                                                                                                                                                  | n/a               | unchanged                                                  |
| `lint:editorconfig`                | `lint:editorconfig / Run editorconfig-checker`                                                                                                                                                                                                                              | yes               | unchanged                                                  |
| `lint:markdown`                    | `lint:markdown / Run markdownlint`                                                                                                                                                                                                                                          | yes               | unchanged                                                  |
| `lint:data`                        | `lint:data / Run yamllint`                                                                                                                                                                                                                                                  | yes               | unchanged                                                  |
| `lint:unused`                      | `lint:unused / Run knip`                                                                                                                                                                                                                                                    | yes               | unchanged                                                  |
| `lint:commits`                     | `lint:commits / Run commitlint`                                                                                                                                                                                                                                             | yes               | unchanged                                                  |
| `scan:secrets`                     | `scan:secrets / Run gitleaks`                                                                                                                                                                                                                                               | yes               | unchanged                                                  |
| `scan:code`                        | `scan:code / Analyze (<language>)`                                                                                                                                                                                                                                          | no                | unchanged                                                  |
| `validate:specs`                   | `validate:specs / Validate ADRs and specs`                                                                                                                                                                                                                                  | yes               | unchanged                                                  |
| **`validate:docs`**                | **`validate:docs / Validate docs`**                                                                                                                                                                                                                                         | yes               | **changed** (was `validate:docs / Validate docs presence`) |
| `validate:deps`                    | `validate:deps / Check dependency catalogs`                                                                                                                                                                                                                                 | yes               | unchanged                                                  |
| `validate:generated`               | `validate:generated / Check generated files`                                                                                                                                                                                                                                | yes               | unchanged                                                  |
| `validate:plugin`                  | no workflow: a package script                                                                                                                                                                                                                                               | n/a               | unchanged                                                  |
| `measure-bundle`                   | `measure-bundle / Upload bundle stats to Codecov`                                                                                                                                                                                                                           | yes               | unchanged                                                  |
| `measure-docs`                     | `measure-docs / Measure documentation coverage`                                                                                                                                                                                                                             | no                | unchanged                                                  |
| `ci`                               | `ci / Required checks`, the aggregate the ruleset requires                                                                                                                                                                                                                  | n/a               | unchanged                                                  |
| `release`                          | `release / Semantic release`, `release / Deploy`, `release / Post-release readme sync` (a group's jobs read `release <group> / …`)                                                                                                                                          | no                | unchanged                                                  |
| `deploy`                           | `deploy / Deploy`                                                                                                                                                                                                                                                           | no                | unchanged                                                  |
| `deploy-preview`                   | `deploy-preview / Deploy preview`, `deploy-preview / Report deployment status`                                                                                                                                                                                              | no                | unchanged                                                  |
| `deploy-docs`, `deploy-components` | the shared `preview` workflow (`Preview`, `Clean up Preview`)                                                                                                                                                                                                               | no                | unchanged                                                  |
| `check-preview`                    | `check-preview / Run monitoring checks against the preview deployment`                                                                                                                                                                                                      | no                | unchanged                                                  |
| `deploy-sentinel`                  | `deploy-sentinel / Build, stage and deploy Sentinel`                                                                                                                                                                                                                        | no                | unchanged                                                  |
| `check-tokens`                     | `check-tokens / Run holocron doctor tokens`                                                                                                                                                                                                                                 | no                | unchanged                                                  |
| `check-notify`                     | `check-notify / Check <channel>`                                                                                                                                                                                                                                            | no                | unchanged                                                  |
| `remind-doctor`                    | `remind-doctor / Remind to run the drift check`                                                                                                                                                                                                                             | no                | unchanged                                                  |
| `sync-repo`                        | `sync-repo / Run holocron repo sync`, `sync-repo / Notify of a failed sync`                                                                                                                                                                                                 | no                | unchanged                                                  |
| `sync-secrets`                     | `sync-secrets / Sync 1Password to Vercel to GH org secret`                                                                                                                                                                                                                  | no                | unchanged                                                  |
| `sync-templates`                   | `sync-templates / Discover consumer repos`, `sync-templates / Sync templates`                                                                                                                                                                                               | no                | unchanged                                                  |
| `sync-specs`                       | `sync-specs / Sync spec discussions`                                                                                                                                                                                                                                        | no                | unchanged                                                  |
| `preview-specs`                    | `preview-specs / Sync spec discussions for the pull request`                                                                                                                                                                                                                | no                | unchanged                                                  |
| `reconcile-projects`               | `reconcile-projects / Reconcile and check the boards`                                                                                                                                                                                                                       | no                | unchanged                                                  |
| `publish-wiki`                     | `publish-wiki / Publish to Fern`                                                                                                                                                                                                                                            | no                | unchanged                                                  |
| housekeeping (no registry id)      | `annotate / Post inline lint annotations`, `greet / Greet first-time contributors`, `label / Apply Labels`, `mark-stale / Mark stale issues and pull requests`, `update-deps / Update the dependencies`, `tag / Tag release`, `sync-dispatch / Broadcast sync to all repos` | no                | unchanged                                                  |

Not posted by Actions or Sentinel: `DCO` (the probot app, required) and the `codecov/*` statuses.

**Unverified.** The `Listed` rows are confirmed from `WORKFLOW_CHECK_CONTEXTS`. For the rest, the check is the task id (the caller job's name) plus the job's `name:` in its reusable workflow under `ci/workflows/`, read from source: `test:unit`'s four jobs, `measure-docs`, `annotate`, `greet`, `label` and `ci` were seen live on recent pull requests, the others were not. The caller job names of `deploy-docs` and `deploy-components`, and the `release <group> /` prefix, were not checked live. The frozen reusables in `theholocron/.github` post their own older job names.

## Migration

- **No required name found.** `holocron` requires `ci / Required checks` and `DCO`; `.github` requires `DCO`; the template
  repos require Actions names plus `codecov/*` and `DCO`. No Sentinel-posted name is required in a ruleset that could be
  read, so a rename cannot block a merge there, and no dual posting is needed.
- **Accepted risk: the private repos' rulesets were not checked.** `.github-private` and the group repos return 403 for
  rulesets, and the decision is to go ahead without reading them. If one of them requires an old Sentinel name (or the old
  `validate:docs / Validate docs presence`), its required check stays pending, because nothing posts the old name any more.
  The remedy, if one is found, is to update that repo's ruleset to the new name, or to have Sentinel post both names for
  one release first. The code does not change for it.
- **A Sentinel instance run from a local build** posts the new names only after a rebuild (the Platform checks come from the
  build the operator runs).
- **Open pull requests** keep the old names on their old commits and post the new ones on the next commit.
- The one name Sentinel matches at runtime, `ci / Required checks` (`SENTINEL_PR_FEED_CHECK_NAME`), is unaffected.
  `post-error-review` quotes the check's name from the run, so it follows the rename.
- Docs that quote the old names are updated in the same change, including the stale `Sentinel / Capability Compliance`.

## Risks

- A repo that requires an old Sentinel name blocks until its ruleset moves. None was found in the rulesets that could be
  read; for the private repos this is an accepted risk (see Migration), with the same remedy.
- While the prefix exists, no Sentinel name equals an Actions name. If the prefix were set to `""` before the Actions
  checks are gone, five names would clash and the aggregate would count Sentinel's checks. Removing the prefix is step 2 of
  "Removing the prefix", after step 1.
- A ruleset that requires a prefixed name breaks when the prefix goes. Update it in the same change.
- The names are free text, so the rule holds only for names built through `sentinelCheckName()`. A check posted another way
  (the dispatched check takes its name from the dispatching code) is covered by listing it in the test.
