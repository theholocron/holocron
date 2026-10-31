---
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
---

# Host the reusable workflows and composite actions in holocron

Part of `tech-monorepo-consolidation.spec.md`. This is the detailed plan for #1215 and #1216.

## Problem

The reusable workflows and composite actions are written here (`cli/astromech/src/templates/reusable/`) and pushed by `holocron sync github` to `theholocron/.github`, which is documented as a pure sync target. Every repo calls them as `theholocron/.github/.github/workflows/<x>.yml@main`.

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

- A constant holds the base (`theholocron/holocron/.github`) and the ref. Every generator, template and starter uses it; a test fails on a literal `theholocron/.github/.github/` outside the shim generator (#1474).
- The ref is a moving tag, `ci-v1`, never `alpha` (holocron's default branch is the prerelease channel) and never `main` directly. The tag is created on a commit of `main` and moved only by a release of the `ci` group, so only when workflow or action files changed. Releasing from `main` only is the rule `platform.syncTemplates` follows today (it publishes from `main` only, so unreleased template changes cannot overwrite what `main` published). Until `main` is promoted (#1101), outside callers stay on `.github@main` through the shims and holocron's own CI moves first.

### Where the sources and the reusables live

A top-level `ci/` folder, like `clients/` and `configs/`, holds the template sources of the reusable workflows and the composite actions, with their tests (#1480). Callable workflows must be in `.github/workflows/` (GitHub allows no subfolders there), so the reusables are generated from `ci/` into this repo's `.github/workflows`, keeping their file names: an outside caller changes only repo and ref in its `uses:`. Composite actions can be at any path, so they are used from `ci/actions/<name>/action.yml` directly and are not copied anywhere. `workflow_call` stays the reusables' only trigger.

`ci/` is a version group (#1481): immutable prefixed tags (`ci-v1.4.0`) that an outside caller can pin, a moving `ci-v1` for those that follow the major, and release analysis scoped to the folder and the generated files it writes. The group publishes nothing to npm; it only versions and tags.

### How holocron calls them

holocron's own callers are generated thin callers, as today, but `uses: ./.github/workflows/<name>.yml`. A local reference runs the reusable at the caller's own commit, so a PR that edits a reusable exercises it. This is the answer to "the monorepo runs them directly" in #1215.

- The generated callers share their file names with the reusables today (`verification.unitTests.yml` is both), so they cannot sit in one directory. holocron's callers are renamed `ci.<name>.yml`. Workflow `name:` and job names do not change, so check names do not change.
- Combined files (`on: pull_request` and `on: workflow_call` in one file) are not used. They need a source for `with:` inputs on direct triggers, which is #1236, and the thin caller already carries the repo's inputs (for example the 76 Codecov uploads). #1236 stays open as a later simplification.

### Composite actions

A reusable called from another repo cannot use `./.github/actions/...`, which resolves in the caller's workspace. Inside the reusables the actions are therefore referenced by full ref: `theholocron/holocron/ci/actions/setup@ci-v1`.

Consequence, accepted and to be documented: a change to a composite action reaches holocron's own CI one tag move later, while a change to a reusable workflow is exercised in its own PR. The first introduction of an action follows the bootstrap rule below.

### Required checks

Required checks are matched by string, and a reusable's check is `<caller job name> / <called job name>`. Callers keep their workflow `name:` and job names; a test pins the generated names for every task before and after each move PR (#1476). No ruleset changes.

### Bootstrap

A new reusable cannot resolve until its ref exists. The order inside any PR that adds one: (1) add it, (2) move or create the tag after merge, (3) switch the callers. The tag move is automated in the release workflow (#1474), with a documented manual command.

## Deprecation plan: what stays in `.github`, and until when

`.github` keeps a forwarding shim for every reusable workflow and composite action it has today, until nothing references it.

- **Generated, not hand-written.** A shim is generated from the same template: it declares the same `workflow_call` inputs and secrets, passes them through, runs `secrets: inherit`, and `uses:` the holocron reusable at `ci-v1`. A composite shim does the same with `uses:` of the holocron action. A shim's job `permissions:` must cover what the inner workflow needs, because a caller's permissions cap the called workflow's.
- **Marked.** Each shim starts with a header: why it exists, what replaces it, the removal condition, and the tracking issue (#1477).
- **Removal condition.** An org-wide scan for `theholocron/.github/.github/` (8 repos, 8 templates, repos generated from templates, themes, the org site, components) reports zero. The scan is a repeatable command, and its first output is the baseline (#1473).
- **Nesting.** A shim adds one level (starter, shim, reusable, and the reusables that call other reusables). Every chain is checked against GitHub's nesting limit (#1477).
- **Documented.** The deprecation plan goes in the `.github` README and on the docs site: what is kept, until what condition, and how a repo can tell it is still on the old path.

The 9 workflows with no template are not moved on faith: the inventory (#1473) marks each as live, legacy or dead, with its callers, and only then is each moved, shimmed or deleted.

## Rollout

1. This spec merged, then the inventory and baseline scan (#1473), which fixes the scope of the rest.
2. The constant and the `ci-v1` ref (#1474). No behaviour change.
3. Check-name test (#1476), before any file moves.
4. Move the templates and composite actions into `ci/`, with astromech taking the folder as input (#1480). The generated files are unchanged.
5. Release `ci/` as a tag-only version group (#1481), then create `ci-v1` on a `main` commit.
6. Generate the reusable workflows into holocron's `.github/workflows`; rename holocron's callers to `ci.<name>.yml` and point them at `./.github/workflows/<name>.yml`; switch the reusables to the `ci/actions` full ref (#1475). holocron's own CI now runs the reusables from this repo.
7. Generate the shims in `.github` (#1477), after the tag exists on a `main` commit. Outside callers still work through them.
8. Repoint the callers, templates and starters (#1478, #1229), one repo per PR, merged by the maintainer. Shrink `holocron sync github` to what `.github` keeps (#1216).
9. When the scan reports zero: delete the shims and anything the inventory marked dead (#1216).

Steps 4 to 6 can ship before `main` is promoted, except the tag, which needs a `main` commit. Steps 7 to 9 follow the promotion (#1101).

## Risks

- **A bad move breaks every repo at once.** Mitigation: nothing outside holocron changes until the shims exist and a repo on the old path has run green through one; repoint repo by repo.
- **Tag moves are a new release step.** A forgotten move leaves outside callers on stale workflows. Mitigation: automate it in the release workflow; the scan and a check that the tag matches the last `main` release run in CI.
- **A shim that forgets an input silently drops it.** Mitigation: generated from the template's `workflow_call` schema, with a test that every input and secret is passed.
- **Hand-written workflows in `.github` are lost.** Mitigation: the inventory before any deletion.

## Decisions

1. **holocron's own caller file name: `ci.<name>.yml`.** Decided by the maintainer; only the file name changes.
2. **No combined `workflow_call` plus direct-trigger files.** #1236 is closed as not planned. A direct run has no `inputs`, so the repo's settings (`affected`, the Codecov `uploads` list) would need a new home, and a direct run's check is named by the job alone (`Run unit tests and collect coverage`) where a call through a caller is `Test / Run unit tests and collect coverage`, so combining would change holocron's required check names. Thin callers keep the names and the generator.
3. **The ref moves only when workflow or action files changed**, as a release of the `ci` group. Decided by the maintainer.
4. **A top-level `ci/` folder holds the templates and composite actions and is a tag-only version group.** Decided by the maintainer. The cost is new support in the group release tooling, which assumes npm-published packages and skips `apps/*` (#1233), and a generator that reads the folder instead of bundling the templates (#1480, #1481).

## Not in scope

- Making the eight template repos externally presentable (a follow-up after this).
- Relocating the `.github-private` docs and `AGENTS.md` (#1217).
- Changing what the workflows do.
