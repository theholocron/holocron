---
id: SPEC-0059
status: proposed
issue: theholocron/holocron#1215
blocked-by: []
related:
  - theholocron/holocron#1200
  - theholocron/holocron#1216
  - theholocron/holocron#1217
  - theholocron/holocron#1229
  - theholocron/holocron#1236
  - theholocron/holocron#1101
  - theholocron/holocron#1473
  - theholocron/holocron#1474
  - theholocron/holocron#1475
  - theholocron/holocron#1476
  - theholocron/holocron#1477
  - theholocron/holocron#1478
  - theholocron/holocron#1480
  - theholocron/holocron#1481
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618610099560518
---

# Host the reusable workflows and composite actions in holocron

Part of `tech-monorepo-consolidation.spec.md`. This is the detailed plan for #1215 and #1216.

## Problem

The reusable workflows and composite actions were written in `cli/astromech/src/templates/reusable/` (now `ci/`, #1480) and are pushed by `holocron sync github` to `theholocron/.github`, which is documented as a pure sync target. Every repo calls them as `theholocron/.github/.github/workflows/<x>.yml@main`.

- A change takes three hops: astromech here, `.github`, each repo.
- A new reusable cannot resolve until it is on `.github`'s `main` (the "bootstrap" note in `platform.syncTemplates`).
- The sync runs from `main` only. holocron's own CI therefore runs the published copy, not the one in the PR, so a PR that edits a reusable never exercises it.
- `.github` also holds 9 workflows with no template (`audit`, `deploy`, `lint`, `release`, `security`, `sync`, `test`, `typecheck`, `wiki`) and 42 starter workflows, and nothing says which are live.

## Goal

`holocron` hosts the reusable workflows and composite actions. `theholocron/.github` keeps only what GitHub reads from that repo by convention:

- `profile/README.md`
- the community-health defaults (CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, ISSUE_TEMPLATE, FUNDING, the PR template)
- `workflow-templates/` (starter workflows), which become thin callers into holocron

Reusable workflows and composite actions can live in any repo, so they are the part that moves. Both repos are public, so a caller needs no Actions access setting (the access policy only applies to private and internal repos).

## Design

### One source, one ref

- A constant holds the base (`theholocron/holocron/.github`) and the ref. Every generator, template and starter uses it; a test fails on a literal `theholocron/.github/.github/` (#1474).
- The ref is a moving tag, `ci-v1`, never `alpha` (holocron's default branch is the prerelease channel) and never `main` directly. The tag is created on a commit of `main` and moved only by a release of the `ci` group, so only when workflow or action files changed. Releasing from `main` only is the rule `platform.syncTemplates` follows today (it publishes from `main` only, so unreleased template changes cannot overwrite what `main` published). Until `main` is promoted (#1101), outside callers stay on `.github@main` through the shims and holocron's own CI moves first.

### Where the sources and the reusables live

A top-level `ci/` folder, like `clients/` and `configs/`, holds the template sources of the reusable workflows and the composite actions, with their tests (#1480). Callable workflows must be in `.github/workflows/` (GitHub allows no subfolders there), so the reusables are generated from `ci/` into this repo's `.github/workflows`, keeping their file names: an outside caller changes only repo and ref in its `uses:`. Composite actions can be at any path, so they are used from `ci/actions/<name>/action.yml` directly and are not copied anywhere. `workflow_call` stays the reusables' only trigger.

`ci/` is a version group (#1481): immutable prefixed tags (`ci-v1.4.0`) that an outside caller can pin, a moving `ci-v1` for those that follow the major, and release analysis scoped to the folder and the generated files it writes. The group publishes nothing to npm; it only versions and tags.

### How holocron calls them

holocron's own callers are generated thin callers, as today, but `uses: ./.github/workflows/<name>.yml`. A local reference runs the reusable at the caller's own commit, so a PR that edits a reusable exercises it. This is the answer to "the monorepo runs them directly" in #1215.

- The generated callers share their file names with the reusables today (`verification.unitTests.yml` is both), so they cannot sit in one directory. holocron's callers are renamed `ci.<name>.yml`. Workflow `name:` and job names do not change, so check names do not change.
- Combined files (`on: pull_request` and `on: workflow_call` in one file) are not used. They need a source for `with:` inputs on direct triggers, and the thin caller already carries the repo's inputs (for example the 76 Codecov uploads). See decision 2; #1236 is closed.

### Composite actions

A reusable called from another repo cannot use `./.github/actions/...`, which resolves in the caller's workspace. Inside the reusables the actions are therefore referenced by full ref: `theholocron/holocron/ci/actions/setup@ci-v1`.

Consequence, accepted and to be documented: a change to a composite action reaches holocron's own CI one tag move later, while a change to a reusable workflow is exercised in its own PR. The first introduction of an action follows the bootstrap rule below.

### Required checks

Required checks are matched by string, and a reusable's check is `<caller job name> / <called job name>`. Callers keep their workflow `name:` and job names; a test pins the generated names for every task before and after each move PR (#1476). No ruleset changes.

### Bootstrap

A new reusable cannot resolve until its ref exists. The order inside any PR that adds one: (1) add it, (2) move or create the tag after merge, (3) switch the callers. The tag move is automated in the release workflow (#1474), with a documented manual command.

## Deprecation plan: what stays in `.github`, and until when

`.github` keeps a **frozen copy** of every reusable workflow and composite action it has today, until nothing references it. (The first plan was a forwarding shim that `uses:` the holocron reusable. A nested reusable adds a level to every check name, `Outer job / Shim job / Inner job`, confirmed on a throwaway run, so every repo still on a shim would stop posting the checks its ruleset requires. Frozen copies keep the names.)

- **Frozen, not forwarded.** `holocron sync github` no longer pushes the moved reusables (the 30 that only run when called) or the 7 composite actions. A repo on `theholocron/.github/.github/workflows/<name>.yml@main` keeps working with the version it had; nothing new reaches it, and fixes are made in holocron only.
- **Marked once.** The first sync after the move reads each copy and adds a `# DEPRECATED — frozen copy.` block below its header: what replaces it, the removal condition and the tracking issue (#1477). A copy that already says so is left alone.
- **Removal condition.** An org-wide scan for `theholocron/.github/.github/` (the active repos: the template repos, the org site, `.github-private`, holocron) reports zero. The scan is `holocron probe ci refs`, and its first output is the baseline (#1473).
- **Not frozen.** The workflows that run where they live (`tag`, `sync-dispatch`, `platform.dispatchedCheck`), the starters and their metadata, and the nine hand-written workflows, which have no template yet (#1475).
- **Moving a repo is one line** (`uses: theholocron/holocron/.github/workflows/<name>.yml@ci-v1`), and the check names do not change (#1478).
- **Documented.** The plan is on the `sync github` page of the docs site. The `.github` README gets the same note in a PR to that repo.

The 9 workflows with no template are not moved on faith: the inventory (#1473, appendix) marks each as live, legacy or dead, with its callers, and only then is each moved, frozen or deleted. All nine turned out to be live.

## Rollout

1. This spec merged, then the inventory and baseline scan (#1473), which fixes the scope of the rest.
2. The constant and the `ci-v1` ref (#1474). No behaviour change.
3. Check-name test (#1476), before any file moves.
4. Move the templates and composite actions into `ci/`, with astromech taking the folder as input (#1480). The generated files are unchanged.
5. Release `ci/` as a tag-only version group (#1481), then create `ci-v1` on a `main` commit.
6. Generate the reusable workflows into holocron's `.github/workflows`; rename holocron's callers to `ci.<name>.yml` and point them at `./.github/workflows/<name>.yml`; switch the reusables to the `ci/actions` full ref (#1475). holocron's own CI now runs the reusables from this repo.
7. Freeze the copies in `.github` (#1477): `sync github` stops pushing the moved files and stamps each as deprecated, once. Outside callers keep working on the version they had.
8. Repoint the callers, templates and starters (#1478, #1229), one repo per PR, merged by the maintainer. Shrink `holocron sync github` to what `.github` keeps (#1216).
9. When the scan reports zero: delete the frozen copies and anything the inventory marked dead (#1216).

Steps 4 to 6 can ship before `main` is promoted, except the tag, which needs a `main` commit. Steps 7 to 9 follow the promotion (#1101).

## Risks

- **A bad move breaks every repo at once.** Mitigation: nothing outside holocron changes until the copies are frozen and a repo on the old path has run green through one; repoint repo by repo.
- **Tag moves are a new release step.** A forgotten move leaves outside callers on stale workflows. Mitigation: automate it in the release workflow; the scan and a check that the tag matches the last `main` release run in CI.
- **A frozen copy gets no fixes.** A repo that stays on `.github@main` keeps any bug the copy had when it was frozen. Mitigation: the notice says where to go, the scan lists who is still there, and moving is one line.
- **Hand-written workflows in `.github` are lost.** Mitigation: the inventory before any deletion.

## Decisions

1. **holocron's own caller file name: `ci.<name>.yml`.** Decided by the maintainer; only the file name changes.
2. **No combined `workflow_call` plus direct-trigger files.** #1236 is closed as not planned. A direct run has no `inputs`, so the repo's settings (`affected`, the Codecov `uploads` list) would need a new home, and a direct run's check is named by the job alone (`Run unit tests and collect coverage`) where a call through a caller is `Test / Run unit tests and collect coverage`, so combining would change holocron's required check names. Thin callers keep the names and the generator.
3. **The ref moves only when workflow or action files changed**, as a release of the `ci` group. Decided by the maintainer.
4. **A top-level `ci/` folder holds the templates and composite actions and is a tag-only version group.** Decided by the maintainer. The cost is new support in the group release tooling, which assumes npm-published packages and skips `apps/*` (#1233), and a generator that reads the folder instead of bundling the templates (#1480, #1481).

5. **Frozen copies in `.github`, not forwarding shims.** Decided by the maintainer after a throwaway run confirmed that a nested reusable renames its checks (`Outer job / Shim job / Inner job`). Cost: a repo that stays on `.github@main` gets no fixes. Gain: no repo's required checks change while it is repointed (#1477).

## Not in scope

- Making the eight template repos externally presentable (a follow-up after this).
- Relocating the `.github-private` docs and `AGENTS.md` (#1217).
- Changing what the workflows do.

## Appendix: inventory of `theholocron/.github` (#1473)

Taken 2026-10-31 from `main` of `.github` and the default branch of every active repository in the org. Regenerate it with `holocron probe ci refs`; `holocron probe ci ref-list` prints every reference with its file and line.

### Baseline

The scan covers 13 active repositories. The seven repositories folded into holocron are archived and private, and are not scanned. References to `theholocron/.github/.github/`:

| Repository               | Files | Workflow refs | Action refs |
| ------------------------ | ----: | ------------: | ----------: |
| .github (host)           |    77 |            47 |          91 |
| .github-private          |    10 |             9 |           2 |
| base-template            |     6 |             6 |           0 |
| cli-template             |    14 |            15 |           0 |
| holocron                 |    99 |            74 |          73 |
| monorepo-nextjs-template |    14 |            15 |           0 |
| monorepo-react-template  |    14 |            15 |           0 |
| monorepo-template        |    14 |            16 |           0 |
| nextjs-template          |    14 |            15 |           0 |
| node-template            |    14 |            15 |           0 |
| react-template           |    14 |            15 |           0 |
| theholocron.github.io    |     9 |             8 |           1 |

**Baseline: 281 references outside the host**, and 138 inside it (the starters and the docs that describe them). The frozen copies can go when the number outside reaches zero. The count includes holocron's own thin callers, the generators that write them and prose in docs; the scan does not tell a live caller from a mention, so read the `--json` output before deleting anything.

Most of the references are the eight template repositories, which each carry 14 callers.

### Findings

- **The 9 hand-written workflows are live, not dead.** `audit`, `deploy`, `lint`, `release`, `security`, `sync`, `test`, `typecheck` and `wiki` are called by every template repository, and by the org site (`audit`, `lint`, `typecheck`) and `.github-private` (`wiki`). They are the older model: the templates still ship `lint`, `typecheck` and `test`, where holocron uses `sourceQuality.*` and `verification.*`. They have no astromech source, so a `holocron sync github` that pruned `.github` would delete them. Fate: bring each into astromech as a template (#1475), then shim. Retiring them is the templates follow-up.
- **Two workflows are dispatched by name, not called.** `sync-dispatch.yml` and `platform.dispatchedCheck.yml` have no `uses:` callers. `delivery.publish` and `platform.repoSync` run `gh workflow run sync-dispatch.yml` against `.github`, and Sentinel dispatches `platform.dispatchedCheck.yml` there. A `workflow_dispatch` workflow runs in the repository that holds it, so a shim that `uses:` another repository cannot replace it. Either they stay in `.github`, or the dispatch target moves to holocron (a change to the release workflow, to Sentinel's config and to the token's scope). Decide in #1216; until then they are neither moved nor shimmed.
- **Three starters are orphans.** `deploy-docs.yml`, `deploy-storybook.yml` and `post-release.yml` in `workflow-templates/` call reusables that do not exist in `.github/workflows`, and have no source under `cli/astromech/src/templates/workflows`. `holocron sync github` never prunes, so they are leftovers. Fate: delete (#1216).
- **Every other file has a live caller.** Of the 40 callable reusables and 7 composite actions, none is unreferenced. `setup` and `holocron` are the most used actions.
- **The org site and `.github-private` call `.github` too.** They are callers to repoint (#1478), as well as the template repositories.

### Reusable workflows (`.github/workflows`, 42)

| File                                         | Source       | Called by                                                   | Fate                                                   |
| -------------------------------------------- | ------------ | ----------------------------------------------------------- | ------------------------------------------------------ |
| `audit.yml`                                  | hand-written | templates, theholocron.github.io                            | generate from a new template (#1475), then frozen copy |
| `bookkeeping.yml`                            | astromech    | holocron, .github-private, templates, theholocron.github.io | moved to holocron; frozen copy here                    |
| `delivery.build.yml`                         | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `delivery.bundleSize.yml`                    | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `delivery.deploy.yml`                        | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `delivery.previewCheck.yml`                  | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `delivery.previewDeploy.yml`                 | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `delivery.publish.yml`                       | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `dependencies.yml`                           | astromech    | holocron, .github-private, templates, theholocron.github.io | moved to holocron; frozen copy here                    |
| `deploy.yml`                                 | hand-written | templates                                                   | generate from a new template (#1475), then frozen copy |
| `greetings.yml`                              | astromech    | holocron, .github-private, templates, theholocron.github.io | moved to holocron; frozen copy here                    |
| `knowledge.wiki.yml`                         | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `lint.yml`                                   | hand-written | templates, theholocron.github.io                            | generate from a new template (#1475), then frozen copy |
| `platform.commitStandards.yml`               | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `platform.dispatchedCheck.yml`               | astromech    | dispatch by name only                                       | stays until #1216 decides                              |
| `platform.notifyCheck.yml`                   | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `platform.repoSync.yml`                      | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `platform.repoValidation.yml`                | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `platform.syncTemplates.yml`                 | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `preview.yml`                                | astromech    | holocron, templates                                         | moved to holocron; frozen copy here                    |
| `release.yml`                                | hand-written | templates                                                   | generate from a new template (#1475), then frozen copy |
| `review.yml`                                 | astromech    | holocron, templates, theholocron.github.io                  | moved to holocron; frozen copy here                    |
| `security.codeScanning.yml`                  | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `security.secretDetection.yml`               | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `security.tokenExpiry.yml`                   | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `security.yml`                               | hand-written | templates                                                   | generate from a new template (#1475), then frozen copy |
| `sourceQuality.deadCodeAnalysis.yml`         | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `sourceQuality.formatting.yml`               | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `sourceQuality.staticAnalysis.yml`           | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `sourceQuality.structuredDataValidation.yml` | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `stale.yml`                                  | astromech    | holocron, .github-private, templates, theholocron.github.io | moved to holocron; frozen copy here                    |
| `sync-dispatch.yml`                          | astromech    | dispatch by name only                                       | stays until #1216 decides                              |
| `sync-github.yml`                            | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `sync.yml`                                   | hand-written | templates                                                   | generate from a new template (#1475), then frozen copy |
| `tag.yml`                                    | astromech    | .github-private, templates                                  | stays: also runs on push                               |
| `test.yml`                                   | hand-written | templates                                                   | generate from a new template (#1475), then frozen copy |
| `typecheck.yml`                              | hand-written | templates, theholocron.github.io                            | generate from a new template (#1475), then frozen copy |
| `verification.performance.yml`               | astromech    | none                                                        | moved to holocron; frozen copy here                    |
| `verification.typeSafety.yml`                | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `verification.unitTests.yml`                 | astromech    | holocron                                                    | moved to holocron; frozen copy here                    |
| `verification.visualRegression.yml`          | astromech    | none                                                        | moved to holocron; frozen copy here                    |
| `wiki.yml`                                   | hand-written | .github-private, templates                                  | generate from a new template (#1475), then frozen copy |

### Composite actions (`.github/actions`, 7)

| Action           | Source    | Called by                       | Fate                                            |
| ---------------- | --------- | ------------------------------- | ----------------------------------------------- |
| `auto-commit`    | astromech | none                            | moved to `ci/actions` (#1480); frozen copy here |
| `codecov-upload` | astromech | none                            | moved to `ci/actions` (#1480); frozen copy here |
| `holocron`       | astromech | holocron                        | moved to `ci/actions` (#1480); frozen copy here |
| `install`        | astromech | none                            | moved to `ci/actions` (#1480); frozen copy here |
| `notify`         | astromech | none                            | moved to `ci/actions` (#1480); frozen copy here |
| `setup`          | astromech | holocron, theholocron.github.io | moved to `ci/actions` (#1480); frozen copy here |
| `setup-node`     | astromech | none                            | moved to `ci/actions` (#1480); frozen copy here |

### Starter workflows (`workflow-templates`, 42 workflows and 13 `.properties.json`)

Starters stay in `.github`, because GitHub reads them only from the org `.github` repository. They become thin callers into holocron at the same `ci-v1` ref, and the `.properties.json` files stay with them.

- Keep and repoint (#1478): `audit.yml`, `bookkeeping.yml`, `delivery.build.yml`, `delivery.bundleSize.yml`, `delivery.deploy.yml`, `delivery.previewCheck.yml`, `delivery.previewDeploy.yml`, `delivery.publish.yml`, `dependencies.yml`, `deploy.yml`, `greetings.yml`, `knowledge.wiki.yml`, `lint.yml`, `platform.commitStandards.yml`, `platform.notifyCheck.yml`, `platform.repoSync.yml`, `platform.repoValidation.yml`, `platform.syncTemplates.yml`, `preview.yml`, `release.yml`, `review.yml`, `security.codeScanning.yml`, `security.secretDetection.yml`, `security.tokenExpiry.yml`, `security.yml`, `sourceQuality.deadCodeAnalysis.yml`, `sourceQuality.formatting.yml`, `sourceQuality.staticAnalysis.yml`, `sourceQuality.structuredDataValidation.yml`, `stale.yml`, `sync-github.yml`, `sync.yml`, `test.yml`, `typecheck.yml`, `verification.performance.yml`, `verification.typeSafety.yml`, `verification.unitTests.yml`, `verification.visualRegression.yml`, `wiki.yml`.
- Delete (#1216): `deploy-docs.yml`, `deploy-storybook.yml`, `post-release.yml`.

### Static files

Community-health files, issue templates, `profile/README.md`, `dependabot.yml`, `labeler.yml`, `CODEOWNERS` and the other dotfiles stay in `.github`. They are not workflows and have no callers.
