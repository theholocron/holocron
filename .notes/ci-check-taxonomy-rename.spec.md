---
id: SPEC-0041
status: draft
issue: theholocron/holocron#989
blocked-by: []
related:
  - theholocron/holocron#678
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618556827963482
---

# CI / Sentinel check-name taxonomy rename

Target mapping proposed in review (table reproduced in full below under
[Target mapping](#target-mapping-as-proposed)). Current taxonomy — `Delivery`,
`Platform`, `Security`, `Source Quality`, `Verification`, `Knowledge` — splits
into seven new top-level categories: `Build & Package`, `Repository Health`,
`Contributor Experience`, `Security` (unchanged), `Code Quality`,
`Testing & Type Safety`, `Documentation Delivery`.

## Where a check's name actually lives

Two independent naming surfaces, with different mechanics — this matters a
lot for scoping the rename, because they don't carry the same risk:

**GitHub-Actions-native checks** (everything backed by a `holocron run <task>`
reusable workflow). Confirmed live against this repo's own ruleset
(`gh api repos/theholocron/holocron/rulesets/18632155`): the required-status-
check **context string is two segments** — `<thin-caller job name> / <reusable
workflow's own job name>` (e.g. `"Build / Build every workspace"`,
`"Static Analysis / Run eslint and actionlint"`). The thin caller's top-level
`name:` field (`Delivery`, `Verification`, …) is **not** part of the context
string at all — it's purely a section-header label in the Actions UI's Checks
tab. **Renaming only that top-level label is cosmetic**: no `WORKFLOW_CHECK_
CONTEXTS` edit, no ruleset resync, no risk of orphaning a required check.

**Sentinel-posted checks** (`@theholocron/sentinel`, the GitHub App). These are
custom Check Runs Sentinel creates directly, so it can — and does — use the
full three-segment name as one literal string
(`SENTINEL_NAMESPACES.platform` + `" / Compliance / Run Holocron config
compatibility"`, etc.). Every segment here is a real part of the required-
check context the moment that check is marked required.

So "rename the taxonomy" is actually three different kinds of change wearing
one table:

1. **Pure relabeling** (top-level category only, Actions side) — e.g.
   `Delivery` → `Build & Package` on the `delivery.build` / `delivery.
bundleSize` thin callers' `name:` field. Zero required-check impact.
2. **Job/step rename** (Actions side job name or reusable-job name text
   itself changes) — e.g. `Audit the Bundle Size` → `Bundle Analysis`,
   `Build every workspace` → `Run tsdown`. This **does** change the required-
   check context string: `WORKFLOW_CHECK_CONTEXTS` in `packages/astromech/
src/generators/github-action-thin-callers.ts` must be updated, and every
   consuming repo's ruleset/branch-protection needs resyncing or the old
   context orphans (see [Rollout risk](#rollout-risk)).
3. **Job split** (one combined CI job becomes several) — `Source Quality /
Static Analysis / Run eslint and actionlint` is one job with two steps
   today; the proposed `Code Quality / Linting / Run eslint` +
   `Code Quality / Linting / Run actionlint` is two separate checks. Same
   shape for `Formatting` (prettier + editorconfig-checker + markdownlint,
   one job) → three separate `Code Quality / Formatting / …` checks. Sentinel
   already posts these split out — `SENTINEL_ACTIONLINT_CHECK_RUN_NAME`,
   `SENTINEL_STATIC_ANALYSIS_CHECK_RUN_NAME` (eslint),
   `SENTINEL_EDITORCONFIG_CHECK_RUN_NAME`, `SENTINEL_FORMATTING_CHECK_RUN_NAME`
   (prettier), `SENTINEL_MARKDOWN_LINT_CHECK_RUN_NAME` are five separate
   constants already. Matching that on the Actions side means restructuring
   `sourceQuality.staticAnalysis.yml` and `sourceQuality.formatting.yml`'s
   reusable workflows into multiple jobs — not a rename, a job topology
   change. Open question below on whether the underlying `astromech` _task_
   (today one `sourceQuality.staticAnalysis` task driving one combined local
   command) splits too, or stays combined locally while CI fans out.

## Rollout risk

Required-status-check matching is exact-string. For every change in category
2 or 3 above: once the template/constant changes and `holocron sync github`
pushes it, the check starts posting under its new name — but every
consuming repo's ruleset still expects the _old_ name until that repo re-runs
`holocron repo setup` (or the ruleset is otherwise resynced). In the gap, the
old required context is permanently unsatisfiable (nothing posts under it
anymore) — GitHub's behavior here is to block merging until an admin updates
the ruleset, not to silently skip it, so this is a hard stop per repo, not a
silent gap. Sequencing matters: template/constant changes merge and sync
first, **then** each consuming repo's ruleset gets resynced, ideally the same
day.

[`#678`](https://github.com/theholocron/holocron/issues/678) (closed,
`tech-ruleset-workflows-rule.spec.md`) investigated replacing context-string
matching with GitHub's `workflows` ruleset rule type specifically to eliminate this
failure mode — the investigation concluded without that migration landing
(the spec file is still `status: draft` in `.notes/`, not moved to
`docs/wiki/specifications/`, which looks like drift worth a follow-up but is
out of scope here). Current mechanism is still exact-string matching, so this
rename inherits the exact risk that spec was trying to design away. Doing the
rename doesn't require resolving that question, but it's worth knowing the
risk isn't new or specific to this change — it's the standing cost of every
check rename under the current architecture.

## Target mapping (as proposed)

### Delivery

| Check                                                                            | Sentinel Equivalent | Rename To                                                                         |
| -------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| Delivery / Audit the Bundle Size / Upload bundle stats to Codecov (pull_request) |                     | Build & Package / Bundle Analysis / Upload bundle stats to Codecov (pull_request) |
| Delivery / Build / Build every workspace (push)                                  |                     | Build & Package / Build / Run tsdown                                              |

### Platform

| Check                                                                     | Sentinel Equivalent                                                   | Rename To                                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| N/A                                                                       | Platform / Compliance / Run Holocron config capability                | Repository Health / Repository Policy / Run Holocron config capability                |
| N/A                                                                       | Platform / Compliance / Run Holocron config capability (pull_request) | Repository Health / Repository Policy / Run Holocron config capability (pull_request) |
| Platform / Commit Standards / Run commitlint                              | Platform / Commit Standards / Run commitlint                          | Repository Health / Repository Policy / Run commitlint                                |
| DCO                                                                       | Platform / Compliance / Run DCO check                                 | Repository Health / Repository Policy / Run Developer Certificate of Origin check     |
| Platform / Greetings / Greet first-time contributors (pull_request)       |                                                                       | Contributor Experience / Pull Request Automation / Greet first-time contributors      |
| Platform / Bookkeeping / Apply Labels (pull_request)                      |                                                                       | Contributor Experience / Pull Request Automation / Apply Labels                       |
| Platform / Repo Validation / Validate ADRs and specs                      | Platform / Repo Validation / Validate ADRs and specs                  | Repository Health / Repository Structure / Validate ADRs and specs                    |
| Platform / Repo Validation / Validate docs presence (pull_request)        | Platform / Repo Validation / Validate docs presence                   | Repository Health / Repository Structure / Validate docs presence                     |
| Platform / Repo Validation / Validate registry consistency (pull_request) | Platform / Repo Validation / Validate registry consistency            | Repository Health / Repository Structure / Validate registry consistency              |
| Platform / Dependencies / Update the dependencies (pull_request)          |                                                                       | Repository Health / Dependency Maintenance / Update the dependencies                  |

### Security

| Check                                                                     | Sentinel Equivalent | Rename To                                                  |
| ------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------- |
| Security / Secret Detection / Run gitleaks (pull_request)                 |                     | Security / Secrets / Run gitleaks                          |
| Security / Code Scanning / Analyze (javascript-typescript) (pull_request) |                     | Security / Code Scanning / Analyze (javascript-typescript) |

### Source Quality

| Check                                                                          | Sentinel Equivalent                               | Rename To                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------- |
| Source Quality / Annotations / Post inline lint annotations (pull_request)     | _job specific_                                    | Contributor Experience / Feedback / Post inline lint annotations |
| Source Quality / Dead Code Analysis / Run knip (pull_request)                  |                                                   | Code Quality / Dead Code / Run knip                              |
| Source Quality / Formatting / Run prettier, editorconfig-checker, markdownlint | Source Quality / Documentation / Run markdownlint | Code Quality / Formatting / Run markdownlint                     |
| Source Quality / Formatting / Run prettier, editorconfig-checker, markdownlint | Source Quality / Formatting / Run editorconfig    | Code Quality / Formatting / Run editorconfig                     |
| Source Quality / Formatting / Run prettier, editorconfig-checker, markdownlint | Source Quality / Formatting / Run prettier        | Code Quality / Formatting / Run prettier                         |
| N/A                                                                            | Source Quality / Inclusive Language / Run alex    | Code Quality / Inclusive Language / Run alex                     |
| Source Quality / Static Analysis / Run eslint and actionlint (pull_request)    | Source Quality / Static Analysis / Run eslint     | Code Quality / Linting / Run eslint                              |
| Source Quality / Static Analysis / Run eslint and actionlint (pull_request)    | Source Quality / Static Analysis / Run actionlint | Code Quality / Linting / Run actionlint                          |
| Source Quality / Structured Data Validation / Run yamllint (pull_request)      |                                                   | Code Quality / Linting / Run yamllint                            |

### Verification

| Check                                                                         | Sentinel Equivalent                           | Rename To                                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Verification / Test / Run interactions and accessibility tests (pull_request) |                                               | Testing & Type Safety / Automated Tests / Run interactions and accessibility tests |
| Verification / Test / Run Storybook interaction tests (pull_request)          |                                               | Testing & Type Safety / Automated Tests / Run Storybook interaction tests          |
| Verification / Test / Run unit tests and collect coverage (pull_request)      |                                               | Testing & Type Safety / Automated Tests / Run unit tests and collect coverage      |
| Verification / Test / Run user flow tests (pull_request)                      |                                               | Testing & Type Safety / Automated Tests / Run user flow tests                      |
| Verification / Test / Run visual and composition tests (pull_request)         |                                               | Testing & Type Safety / Automated Tests / Run visual and composition tests         |
| Verification / Typecheck / tsc --noEmit                                       | Verification / Type Safety / Run tsc --noEmit | Testing & Type Safety / Type Checking / tsc --noEmit                               |

### Knowledge

| Check                                                | Sentinel Equivalent | Rename To                                             |
| ---------------------------------------------------- | ------------------- | ----------------------------------------------------- |
| Knowledge / Publish (pull_request)                   |                     | Documentation Delivery / Publishing / Publish         |
| Knowledge / Preview / Publish to Fern (pull_request) |                     | Documentation Delivery / Publishing / Publish to Fern |

## Open questions

- **`delivery.deploy` and `delivery.publish`** aren't in the table at all,
  but they currently share the `Delivery` top-level label with `delivery.
build` and `delivery.bundleSize`, which the table _does_ move to
  `Build & Package`. Do deploy/publish move too (to `Build & Package`, or
  somewhere else), or stay under a (now orphaned) `Delivery` label? Needs a
  decision before the thin-caller `name:` fields are touched.
- **Do the Static Analysis and Formatting job splits happen at the astromech
  task level, or only in the generated CI YAML?** Today `holocron run
sourceQuality.staticAnalysis` is one task running eslint then actionlint
  locally; `sourceQuality.formatting` runs prettier, editorconfig-checker,
  and markdownlint as one task. Splitting the _CI checks_ into `Code Quality
/ Linting / Run eslint` + `Run actionlint` (and the three Formatting
  checks) without splitting the underlying task would mean a contributor
  sees one combined step locally (including in the namespace-grouped
  interactive `run` picker, #988) but two-to-three separate required checks
  on the PR — a parity gap the existing `tech-ruleset-workflows-rule.spec.md`
  explicitly calls out as something to preserve ("a developer sees the same
  names locally as on a PR"). Splitting the tasks themselves is the
  parity-preserving option, but ripples into `CI_ORDER`, `KNOWN_TASKS`, the
  interactive run-menu's namespace grouping, and every repo's `holocron.
config.ts` `tasks: [...]` array that names `sourceQuality.staticAnalysis` /
  `sourceQuality.formatting` explicitly.
- **Rollout sequencing across every consuming repo.** Once the context-
  string-affecting renames (category 2/3 above) are decided, every repo
  with a ruleset or classic branch protection referencing the old context
  needs `holocron repo setup` (or equivalent resync) run against it in the
  same window the templates sync — otherwise that repo's required check
  becomes permanently unsatisfiable until resynced. Needs an inventory of
  which repos currently require which of the renamed checks.
- **Sentinel namespace map.** `SENTINEL_NAMESPACES` (`apps/sentinel/src/
utils/constants.ts`) only has three keys today (`platform`, `verification`,
  `sourceQuality`) — the new taxonomy needs `Build & Package`,
  `Repository Health`, `Contributor Experience`, `Code Quality`,
  `Testing & Type Safety`, `Documentation Delivery` as new entries (`Security`
  is unchanged). Each of the 12 `SENTINEL_*_CHECK_RUN_NAME` constants (plus
  their tests asserting the literal string) needs its job/step label updated
  too where the table changes it, not the namespace segment.

## Scope

- Decide + resolve the open questions above.
- Update the category-2/3 Actions-side names (`WORKFLOW_CHECK_CONTEXTS`,
  the affected `packages/astromech/src/templates/{reusable,workflows}/*.yml`
  files) and the purely-cosmetic category-1 top-level `name:` relabels.
- Update `SENTINEL_NAMESPACES` and every affected `SENTINEL_*_CHECK_RUN_NAME`
  constant + its test.
- `holocron sync github` to push the updated reusable templates, then an
  inventory + resync pass (`holocron repo setup`) across every consuming
  repo with an affected check in its required-checks list.
- Docs: any `docs/wiki/` or `README.md` reference to the old names.

## Out of scope

- Resolving `#678`'s `workflows`-ruleset-rule question — that's a separate,
  already-closed workstream; this rename ships under the current exact-
  string-matching architecture regardless of that question's eventual
  outcome.
- Any task-registry restructuring beyond what the Static-Analysis/Formatting
  split decision requires (no unrelated task reshuffling).
- The interactive `run` menu's namespace grouping/ordering (#987/#988) — if
  the Static Analysis/Formatting task split is decided, that menu picks up
  the new task names for free (it reads the resolved manifest), but no
  menu-specific work is anticipated here.

## PR-stack

TBD — filed once the open questions above have answers.
