---
status: proposed
issue: theholocron/holocron#2036
blocked-by: []
related:
  - theholocron/holocron#1547
  - theholocron/holocron#989
---

# Sentinel check names: two tiers, one casing rule

Supersedes `ci-check-taxonomy-rename` (SPEC-0041, #989). Sentinel's check runs move from three tiers, `Category / Group /
Action`, to two, `Group / Action`, and the shape is enforced by a test so it cannot drift.

## Context

The checks that a pull request shows come from two places that name things differently:

- **Actions checks** are named from the workflow files. Since `ci-flat-task-vocabulary` they are two segments, `<task id> /
<step>` (`lint:code / Run eslint, actionlint and prettier`, `typecheck / Run tsc --noEmit`, `ci / Required checks`). The
  top-level workflow `name:` is not part of the context string.
- **Sentinel's checks** are check runs the App creates directly, so each name is one literal string of the author's choosing.
  Thirteen of them have three segments, built from `SENTINEL_NAMESPACES` (`Platform`, `Source Quality`, `Verification`).

The first segment is the old astromech task namespace (`platform.commitStandards`, `sourceQuality.staticAnalysis`). That
vocabulary is retired on the Actions side, nothing reads the segment, and GitHub already shows the posting App's name next
to a check run. SPEC-0041 proposed replacing it with seven new categories; with the Actions side settled it has nothing
left to name.

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
Only config compatibility and alex have no Actions twin.

## What each tier encoded

| Tier | Values                                                             | Meaning                                                                     | Lost if dropped                           |
| ---- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------- |
| 1    | `Platform`, `Source Quality`, `Verification`                       | the retired astromech task namespace                                        | grouping in the checks list, nothing else |
| 2    | `Compliance`, `Commit Standards`, `Repo Validation`, `Formatting`… | the old Actions caller job name, kept so the names matched the Actions ones | the concern: this is the useful tier      |
| 3    | `Run eslint`, `Validate docs presence`…                            | the command or the verb                                                     | which tool ran                            |

## Options

- **A. `Group / Action`.** Drop tier 1 and keep the other two. Chosen.
- **B. `<task id> / <tool>`** (`lint:code / eslint`). One vocabulary with Actions, but the `ci` aggregate takes every check
  run whose name starts with `"<task id> / "`, treats a running one as pending and a failed one as a failure. A Sentinel
  check named that way would join the aggregate and become gating by accident. It would also need invented ids for the
  Sentinel-only checks. Rejected.
- **C. `sentinel / <check>`.** A clear rule, but GitHub already shows the App's name, and a hand-added prefix was removed
  once for duplicating it ("The Holocron Sentinel / Sentinel / Platform / …"). It also loses the concern. Rejected.

## Decision

Sentinel's checks are named `Group / Action`, two segments joined by one `/`, built by one function,
`sentinelCheckName(group, action)`. The first segment of today's name goes; `SENTINEL_NAMESPACES` goes with it.

### Names

| Old                                                                        | New                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Platform / Compliance / Run Holocron config compatibility`                | `Compliance / Run Holocron config compatibility`                |
| `Platform / Compliance / Run Holocron config compatibility (pull_request)` | `Compliance / Run Holocron config compatibility (pull_request)` |
| `Platform / Compliance / Run Developer Certificate of Origin`              | `Compliance / Run Developer Certificate of Origin`              |
| `Platform / Commit Standards / Run commitlint`                             | `Commits / Run commitlint`                                      |
| `Platform / Repo Validation / Validate ADRs and specs`                     | `Repo Validation / Validate ADRs and specs`                     |
| `Platform / Repo Validation / Validate docs presence`                      | `Repo Validation / Validate docs`                               |
| `Source Quality / Formatting / Run prettier`                               | `Formatting / Run prettier`                                     |
| `Source Quality / Formatting / Run editorconfig`                           | `Formatting / Run editorconfig`                                 |
| `Source Quality / Documentation / Run markdownlint`                        | `Documentation / Run markdownlint`                              |
| `Source Quality / Inclusive Language / Run alex`                           | `Inclusive Language / Run alex`                                 |
| `Source Quality / Static Analysis / Run eslint`                            | `Static Analysis / Run eslint`                                  |
| `Source Quality / Static Analysis / Run actionlint`                        | `Static Analysis / Run actionlint`                              |
| `Verification / Type Safety / Run tsc --noEmit`                            | `Type Safety / Run tsc --noEmit`                                |

`Commit Standards` becomes `Commits` because a repo on the frozen reusables posts `Commit Standards / Run commitlint` from
Actions (`LEGACY_CALLERS`); an exact clash with Sentinel's check would be confusing. `Static Analysis` and `Formatting`
only partly overlap those callers (the called job names differ), so they stay.

### The docs check loses "presence"

`Validate docs presence` becomes `Validate docs`, on both sides: Sentinel's `Repo Validation / Validate docs` and the
Actions check `validate:docs / Validate docs` (the job and step names in `ci/workflows/validate/docs.yml`, the entry in
`WORKFLOW_CHECK_CONTEXTS`, the generated `.github/workflows/validate-docs.yml`). The `validate:docs` task runs
`holocron probe docs validate`, which is `docs presence` (a warning) followed by `docs tokens` (a failure), so "presence"
no longer describes the check. The probe keeps its name, `docs presence`, and so do the `Docs presence: …` summary titles:
they name what the probe measures, not the check.

The `ci` aggregate waits for `validate:docs` by the prefix `validate:docs / `, so the part after the slash does not matter
to it. No ruleset that could be read lists the exact string (`holocron` requires `ci / Required checks` and `DCO`; the
other readable rulesets, including the template repos', hold no `Validate docs` context). A repo on the frozen reusables
keeps posting the old job name from its frozen copy until `CI_HOME` moves.

### Casing

- The **group** is Title Case: every word starts with a capital and the rest are lower case (`Static Analysis`,
  `Repo Validation`, `Inclusive Language`).
- The **action** is a sentence-case verb phrase that starts with a capitalised verb (`Run`, `Validate`). A tool, an
  acronym or a proper noun keeps its own casing: `Run eslint`, `Run tsc --noEmit`, `Validate ADRs and specs`, `Run
Developer Certificate of Origin`.
- An event suffix is the event's name, in parentheses: `(pull_request)`.

Every current name already follows the rule, so the casing needs no rename beyond the dropped tier. `checkNameProblem()`
returns what is wrong with a name (or `undefined`), and a test runs it over every `SENTINEL_*_CHECK_RUN_NAME`.

## Migration

- **No required name found.** `holocron` requires `ci / Required checks` and `DCO`; `.github` requires `DCO`; the template
  repos require Actions names plus `codecov/*` and `DCO`. No Sentinel-posted name is required in a ruleset that could be
  read, so a rename cannot block a merge there, and no dual posting is needed.
- **Unverified.** The rulesets of the private repos (`.github-private` and the group repos) could not be read and were not
  checked. If one requires a Sentinel name, Sentinel posts both names for one release first, then the ruleset moves.
- **A Sentinel instance run from a local build** posts the new names only after a rebuild (the Platform checks come from the
  build the operator runs).
- **Open pull requests** keep the old names on their old commits and post the new ones on the next commit.
- The one name Sentinel matches at runtime, `ci / Required checks` (`SENTINEL_PR_FEED_CHECK_NAME`), is unaffected.
  `post-error-review` quotes the check's name from the run, so it follows the rename.
- Docs that quote the old names are updated in the same change, including the stale `Sentinel / Capability Compliance`.

## Risks

- A repo that requires an old Sentinel name blocks until its ruleset moves. Mitigated by the finding above; unverified for
  the private repos.
- A new Sentinel name equal to an Actions name would make two checks indistinguishable. `Commits` avoids the known one; the
  casing test does not guard this, so a future check is compared against `WORKFLOW_CHECK_CONTEXTS` by hand.
- The names are free text, so the rule holds only for names built through `sentinelCheckName()`. A check posted another way
  (the dispatched check takes its name from the dispatching code) is covered by listing it in the test.
