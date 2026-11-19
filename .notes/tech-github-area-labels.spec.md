---
id: SPEC-0101
status: draft
issue: theholocron/holocron#2430
blocked-by: []
related:
  - theholocron/holocron#2263
  - theholocron/holocron#2134
  - theholocron/holocron#2253
  - theholocron/holocron#1967
discussion:
  url: https://discord.com/channels/1303969001822486568/1573051082706522126
---

# GitHub labels: kind on pull requests, Type on issues, area labels on both

> Design only. No code, no label change and no backfill is made by the pull request that carries this file. Counts are the maintainer's, measured 2026-11-19; the repository facts below were read from `alpha` @ `31f957cde`.

## Problem

Labels carry two jobs that no longer fit one set.

- **Kind of change** (`bug`, `enhancement`, `chore`, ...) is set on a pull request from its title by `.github/labeler.yml` (the `label` task, `github/issue-labeler`, `include-title: 1`, `include-body: 0`, `sync-labels: 1`). On an issue it is set by hand or by `holocron new issue --label`.
- GitHub now has issue **Type** (the org has `Task`, `Bug`, `Feature`: read with `gh api orgs/theholocron/issue-types`). It is the better home for the kind of an _issue_: one value, a column in Projects, a filter that cannot drift. But only 184 of about 694 issues have one (29 Bug, 102 Feature, 53 Task), while 310 carry `bug`, `enhancement` or `chore`. `holocron new issue` sets labels and never a Type.
- Nothing says **where** a change or an issue lives. The 400 latest PR scopes are topics (`cli` 71, `specs` 61, `sentinel` 29, `deps` 23, `ci` 18, `monitoring` 17, `env` 13, `ideas` 11, ...), not folders, so a title cannot be turned into an area.

Two facts the brief did not state and that shape the design:

1. **The labeler runs on pull requests only.** `.github/workflows/ci.label.yml` triggers on `pull_request` `opened` and `edited`, and the reusable's step is `if: github.event_name == 'pull_request'`. No issue is ever labeled by it, so the 200 `enhancement` issues were labeled by hand or by `new issue`.
2. **`github/issue-labeler` reads text, not paths.** Its config is a regex per label. It cannot see the changed files, so area labels from folders need another tool (below), and the existing `labeler.yml` schema is not the schema of `actions/labeler`.

## Goals and non-goals

Goals: one place for an issue's kind (Type); an `area` label on pull requests, from the diff, with no hand work; an `area` label on issues with as little hand work as possible; a way to retire a label without stripping it from history; a reviewed, repeatable backfill of Type.

Non-goals: new kind labels; labels on pull requests that replace the Conventional Commit type; `holocron new issue --type` (a separate spec; this one only says what it needs, see "What `new issue` does"); deleting labels from issues and pull requests; per-package labels.

## Decisions already made (maintainer)

1. Kind labels stay on pull requests, set from the title's type by `labeler.yml`. On issues, kind is Type (Bug, Feature, Task).
2. Area labels with a prefix are added, automated from the changed folders where possible.
3. Existing issues are backfilled: `bug` to Bug, `enhancement` to Feature, `chore` to Task; Type is relied on afterwards.

## Area labels

### Which areas

Enumerated from the tree. The brief's list is right; additions and corrections are marked.

| Area label (proposed) | Paths                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `area: cli`           | `cli/**` (the five packages `cli`, `astromech`, `datapad`, `dagobah`, `kyber` are one area: they release together and share a scope)                   |
| `area: sentinel`      | `apps/sentinel/**`                                                                                                                                     |
| `area: comlink`       | `apps/comlink/**`                                                                                                                                      |
| `area: council`       | `apps/council/**`                                                                                                                                      |
| `area: plugins`       | `plugins/**` (22 directories on disk, not 21: `holocron-plugin-turbo` is the one the repo layout in `AGENTS.md` omits). One label, not one per plugin. |
| `area: clients`       | `clients/**` (the folder also holds `scripts/`)                                                                                                        |
| `area: configs`       | `configs/**`                                                                                                                                           |
| `area: utils`         | `utils/**`                                                                                                                                             |
| `area: observability` | `observability/**`                                                                                                                                     |
| `area: skills`        | `skills/**`, `.claude/skills/**`                                                                                                                       |
| `area: themes`        | `themes/**`                                                                                                                                            |
| `area: docs`          | `docs/**` except `docs/wiki/**`, and `fern/**` (the documentation site and its config)                                                                 |
| `area: specs`         | `docs/wiki/**` (specifications and decisions), `.notes/**`                                                                                             |
| `area: ci`            | `ci/**`, `.github/workflows/**` (generated copies of `ci/`)                                                                                            |

Missed in the brief: `fern/` (the wiki's config, goes with `docs`), `ci/` (a real package: `@theholocron/ci`, with workflows, actions and matchers), `.notes/` (specs in progress, goes with `specs`), `.claude/` and `.holocron/` (the latter holds config and the org agent instructions: proposed `area: config` is not added, because `holocron.config.ts` and `.holocron/**` are the repo's own settings and would label nearly every setup PR; they get no area, see Q3), and root files (`pnpm-workspace.yaml`, `package.json`, `turbo.json`, lockfile: no area; the `dependencies` kind already says it). `scripts/` at the root is also left without one.

A pull request touching several folders gets several labels. A pull request touching none of the listed paths gets none; that is correct, not a failure.

### Label format: options

| Option | Example      | For                                                                                                                                                                     | Against                                                                                                                                             |
| ------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | `area: cli`  | Sorts together in the label list and the picker; reads as a field; matches the `priority: high` label spelling that `splitLabels()` in the GitHub plugin already parses | Colon and space in a name; Linear label groups may use the colon differently (Not verified)                                                         |
| B      | `area/cli`   | No space, shell and URL friendly                                                                                                                                        | Unlike the existing `priority: high`; slash is a Linear nested-label separator (Not verified), so it may become a group on migrate                  |
| C      | `cli` (bare) | Shortest                                                                                                                                                                | Collides with the kind labels `ci`, `documentation` and with the 2 issues already labeled `cli`; no prefix to filter on or to tell apart from kinds |

**Recommendation: A, `area: <name>`**, one colour for the whole family (a muted blue, `1d76db`, not used by a kind label; kinds use `0075ca`, `0366d6`, `a2eeef`, so the colour is Q2's detail), description `Changes under <paths>`. Kind labels keep their names, so nothing existing is renamed.

### `docs` against `documentation`

With the prefix the two no longer collide: `documentation` stays the **kind** (a `docs:` PR), `area: docs` is the **place** (the site). They routinely differ: a `docs(specs):` PR is kind `documentation` and area `area: specs`; a `feat(docs):` PR is kind `enhancement` and area `area: docs`. Recommended: keep both names, make the descriptions say it (`documentation`: `Documentation only (kind)`; `area: docs`: `The documentation site and its config`), rename nothing. Renaming the kind (`kind: docs`) would touch 222 items, `labeler.yml`, `CANONICAL_LABELS` and Linear for no gain once the prefix exists. The same argument covers `ci` the kind against `area: ci`.

### Automation: options

| Option                                                          | What it is                                                                                                                                                                                                    | For                                                                                                                                                                                                                                                                                          | Against                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `actions/labeler` in a workflow                              | A second reusable (`ci/workflows/label-areas.yml`) over `changed-files` globs; its own file `.github/labeler-areas.yml` (a different schema from the title config, so it cannot be merged into `labeler.yml`) | Off the shelf; globs are the tool's own; `sync-labels` removes an area when its files leave the diff                                                                                                                                                                                         | A new task, caller, check name and `CI_HOME` frozen-reusable question (the `.github` copies do not move until `CI_HOME` does); runs on a runner with a token for every PR; the `pull_request_target` question for fork PRs (Not verified: this repo's PRs are same-repo, forks are not a case today) |
| 2. A Sentinel action (`apps/sentinel/src/actions/area-labels/`) | Reads the PR's changed files through the API, maps them by the repo's declared globs, adds and removes `area:` labels; pure `planAreaLabels(files, areas)` plus a thin API layer, like `pr-feed`              | Needs only the diff and the API, which is Sentinel's side of `process-sentinel-and-actions-roles` (#2263); no runner minute, no checkout; the glob map is declared once in config and read by `setup` (to make the labels) and Sentinel (to apply them); a quiet `skipped` when unconfigured | Sentinel is not a check here: it makes a write (labels), unlike the ten checks of the role split; the App needs `issues`/`pull_requests` write (Not verified: the installed permissions); production Sentinel is down (#1100), so it works only on the dev instance until that is back               |
| 3. Extend `issue-labeler`                                       | Add regexes on the title                                                                                                                                                                                      | No new task                                                                                                                                                                                                                                                                                  | Cannot see paths; scopes are topics (see Problem); would label wrongly                                                                                                                                                                                                                               |

**Recommendation: 2 (Sentinel), with 1 as the fallback if the App cannot hold the permission.** Rationale: the area map is declared per repository (folder layouts differ), the work is a pure function of the diff and the API, and #2263 already puts exactly that class of work in Sentinel. The map lives in config, names only, as a new key of the `repo` area (`.holocron/repo.ts`, `satisfies RepoConfig`): `labels: { areas: [{ name: "cli", paths: ["cli/**"] }, ...] }` (proposed shape, final name Q4). `setup` makes the labels; `doctor repo` reports one declared and missing. A repo that declares no `areas` gets nothing: no label, no workflow, no change.

**Which repositories.** The kind labels (`CANONICAL_LABELS`, `labeler.yml`) are org-wide: `setup` writes them to every org repo and `doctor repo` checks them. **Area labels are not org-wide**, because they name this repo's folders. They apply to repos that declare `areas`, which today is holocron only (`clients`, `configs`, `utils`, `observability`, `skills`, `themes` are folders here now; their former repos are archived). `CANONICAL_LABELS` therefore does not change. `doctor repo` already reads canonical labels with `flagExtra: false` (labels outside the set are left alone), so a per-repo `area: x` label is never a finding; the doctor gains a row only for a declared area that is missing.

### Issue area labels

Three ways, not exclusive:

- **By hand or with `new issue --label "area: cli"`**: works today, no code. The label is validated nowhere.
- **From the title's scope**: rejected, scopes are topics (`feat(monitoring)`, `chore(env)`) with no folder.
- **From the pull request that closes the issue**: Sentinel's board-status handler already reads `closingIssuesReferences`; the same action can copy a PR's `area:` labels to the issues it closes, only adding, never removing. It labels the issue when work is done, not when it is filed, so it helps filtering history, not triage.

**Recommendation:** by hand at filing (and an optional picker later in `new issue`), plus the copy-from-PR step as a later, separate change. No automated labeling of a new issue from its title.

## Kind: Type on issues, labels on pull requests

- `labeler.yml` is unchanged: it keeps labeling PRs (and only PRs, as today).
- On an issue, kind is Type. Types exist only on issues, never PRs, which is why both mechanisms stay.
- `bug`, `enhancement`, `chore` on an issue are no longer set by anything once `new issue` sets Type. Existing ones are left in place (see Backfill).
- The mapping `bug` to Bug, `enhancement` to Feature, `chore` to Task is the only one decided. The other kind labels that appear on issues (`refactor` 17, `documentation` 19, `ci` 44, `test` 4, `performance` 1, `dependencies` 2) have no Type of their own; Q5.

## Retiring a label without losing it

Deleting a label strips it from every issue and pull request that had it, and `setup` does exactly that to `STALE_LABELS` (`syncLabels(CANONICAL_LABELS, STALE_LABELS)`, and `doctor repo` reports `stale label X (setup removes it)`). So there are three states, and a label moves down only deliberately:

| State                     | How                                                  | Effect                                                                                          |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| In use                    | In `CANONICAL_LABELS`                                | `setup` makes it, `doctor` checks colour and description                                        |
| **Retired (no deletion)** | Out of `CANONICAL_LABELS`, **not** in `STALE_LABELS` | `setup` and `doctor` ignore it (`flagExtra: false`); existing items keep it; nothing applies it |
| Deleted                   | In `STALE_LABELS`                                    | Removed from every item that had it, everywhere `setup` runs                                    |

Recommendation: retire by removing from `CANONICAL_LABELS` and stay out of `STALE_LABELS` unless the label has no use in any org repo (count first with `gh label list` and `gh issue list --label` per repo; the figures given are for holocron only, Not verified for the others). A retired label has no marker in the code; an inline comment next to the list is enough, and a `RETIRED_LABELS` constant would be a third list to keep with no consumer. A rename (`gh label edit --name`) also keeps every attachment, which is how `cli` (2 issues) becomes `area: cli`.

### Stock labels, one by one (holocron counts: issues / PRs)

| Label                           | Use    | Recommendation                                                                                                                                     |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `question`                      | 0/0    | Retire (out of the canonical set, not deleted). Questions go to Discord; GitHub Discussions are not used here (Not verified).                      |
| `invalid`                       | 0/0    | Retire. `wontfix` and `duplicate` cover the closing reasons in use.                                                                                |
| `good first issue`              | 0/0    | Keep. GitHub's contributor surfaces key off this exact name; it costs nothing, and removing it would be the one change a public repo could regret. |
| `help wanted`                   | 0/0    | Keep, for the same reason.                                                                                                                         |
| `triage`                        | 2/0    | Keep for now. A lifecycle label, not a kind; if the project board's status replaces it, retire it in that work, not here.                          |
| `performance`                   | 1/0    | Keep. It is the `perf:` PR label the labeler sets; zero PRs so far means no `perf:` commit yet, not an unused rule.                                |
| `epic`                          | 1/0    | Leave alone. Not canonical; no Type for it exists (the org's Types are Task, Bug, Feature). Revisit if an `Epic` Type is added.                    |
| `cli`                           | 2/0    | Rename to `area: cli` when area labels land; keeps both issues.                                                                                    |
| `wontfix` 6/28, `duplicate` 1/0 | in use | Keep.                                                                                                                                              |
| `released` 230/802              | in use | Keep (set by the release workflow, not a kind).                                                                                                    |

## What changes for Linear

Read in `plugins/holocron-plugin-linear/src/provider/setup.ts`, `provider-config.ts` and `plugins/holocron-plugin-github/src/capabilities/issues-migration.ts`.

- `provider linear setup` makes the labels the `labels` option lists, taking a colour from `CANONICAL_LABELS` by name (`colorOf()`). Linear has **no issue Type**, so kind there stays a label (`bug`, `enhancement`, `chore`): the canonical list must keep those three, which this spec does not touch. An `area: cli` label would get no canonical colour (it is not in `CANONICAL_LABELS`) and is made with Linear's default unless `colorOf()` learns the area family; a small follow-up, not a blocker.
- `IssueRecord` carries `labels: string[]` and no type or kind. So today a GitHub issue migrated to Linear keeps its `bug` label, and one with a Type but no label arrives with **no kind at all**. Once issues rely on Type this becomes a loss. Recommended follow-up, separate from this spec's implementation: add an optional `kind` (`bug`, `feature`, `task`) to `IssueRecord`; the GitHub export fills it from Type, falling back to the label map; the Linear import writes the kind label; the GitHub import and `sync` set Type from `kind` and do not write the kind label. Until then, the backfill must happen _before_ any migration that depends on Type, and the labels left on old issues (below) keep those migrations whole.
- `splitLabels()` already turns a `priority: <level>` label into the Priority field; `area: x` is not matched by it and travels as an ordinary label both ways. Whether Linear treats `area: cli` as plain text or as a group, and whether the `:` is accepted, is Not verified.

## What `holocron new issue` does

Today it sets labels and no Type (`run-issue-create.ts` passes `labels`). A `--type` option and the provider method behind it belong to a separate spec; this one only fixes what they must honour: GitHub gets Type, Linear gets the kind label for the same value, and a bare `--label bug` on a GitHub target is a hint to set Bug and not to add the label. Setting the Type needs the issue REST update (`type` field, Not verified against the live API: this spec ran no write) or GraphQL `updateIssue` with an `issueTypeId`.

## Backfill

Writes to live issues. Described here; **not run by this spec's author**.

- **What.** For each issue in `theholocron/holocron` (and, if wanted, each org repo, Q6) that has no Type: `bug` gives Bug, `enhancement` gives Feature, `chore` gives Task. An issue that already has a Type is never changed (the 184 that do). An issue with more than one of the three labels is listed and left for a person. Closed issues are included, so history filters work. Pull requests are skipped (no Type exists for them; GitHub's issues API also returns PRs, so they must be filtered).
- **Scale.** 310 label occurrences against 184 typed; the number to change is smaller (overlap unknown, to be read by the dry run).
- **How.** A writer probe on the GitHub plugin, `holocron probe github issue-types`, with `writes: true` so it follows the probe rules: it lists the plan and does nothing on `--dry-run`, asks first without `--yes`, goes through `ctx.write`, never repeats a done write, and stops cleanly on a rate limit and reports what is left (`sync issues` already does the same). It is idempotent: a second run finds every issue typed and changes nothing. A one-off `gh` script is rejected: "anything that can be automated belongs in the CLI", and the probe can be reused for another repo.
- **Review.** The dry run prints a table (issue, current labels, proposed Type) and counts per mapping, plus the skipped ones with the reason (already typed, ambiguous, no kind label). The maintainer reads it, and may attach it to the issue; only then is the real run started.
- **Who runs it.** The maintainer, with a token that can write issues (the `github.issues` token). Nobody else and no schedule: it is a one-time repair.
- **After.** The kind labels are **left on the issues**. Nothing is lost, filters by `label:bug` keep working, and Linear migration keeps its source of kind (above). Stripping them from issues is a separate decision (Q5), never part of the backfill. `new issue` stops adding them once it sets Type.

## Rollout

One pull request is one focused change; the spec is this PR. In order, each after the previous is merged:

1. **This spec** (design only).
2. **Area declaration and labels**: the `repo.labels.areas` shape (`RepoConfig`), `setup` makes the labels, `doctor repo` row, tests, docs (`cli/cli/README.md`), `.holocron/repo.ts` declares this repo's areas; rename `cli` to `area: cli` by hand after merge.
3. **Area labeling on PRs**: the Sentinel `area-labels` action (or the `actions/labeler` workflow if Q1 says so), with the pure planner and its tests; deploy on the dev instance first and check a real PR.
4. **Type on `new issue`** (its own spec, `--type`), and the Linear `kind` follow-up.
5. **Backfill probe** and its docs; then the maintainer's dry run and real run.
6. **Retire the stock labels** (`question`, `invalid`) by editing `CANONICAL_LABELS` and its test; no deletion.
7. Optional: copy a PR's areas to the issues it closes.

Step 5 should wait for step 4 so that no new unlabeled, untyped issue appears behind it.

## Open questions for the maintainer

1. **Where do area labels get applied: Sentinel (recommended) or `actions/labeler`?** Does the dev Sentinel App have `issues`/`pull_requests` write, and are you content for it to write labels (not a check)?
2. **Prefix format:** `area: cli` (recommended), `area/cli`, or bare? And the colour of the family.
3. **The set of areas.** Is one `area: cli` for the five `cli/` packages right, or should `kyber`/`astromech` stand alone? Do you want `area: apps` (one) or the three app labels (recommended)? Should `.holocron/**` and the root config files carry an `area: config`? Is `area: specs` separate from `area: docs` (recommended) or one?
4. **The config key:** `repo.labels.areas` in `.holocron/repo.ts`, or a new `.holocron/` area file? (`repo` is local to a repo, which is right here.)
5. **Other kind labels on issues** (`refactor`, `documentation`, `ci`, `test`, `performance`, `dependencies`): map to Task, leave unmapped, or put a new Type in the org? And do you ever want kind labels stripped from issues once Type is set, or left forever (recommended)?
6. **Backfill scope:** holocron only, or every org repo? Who runs it (you, as recommended)?
7. **Retiring:** `question` and `invalid` are retired without deletion (recommended). Is that count zero in the other org repos too? Keep `good first issue` and `help wanted`, and `triage` as recommended?
8. **Linear `kind` on `IssueRecord`:** do the follow-up now, or accept losing the kind of a Type-only issue on migrate until it is needed?

## Not verified

- No write was made, so the following were not tried: setting a Type through the REST or GraphQL API, the Sentinel App's installed permissions, and whether a label named `area: cli` is accepted unchanged by Linear (colon, space, and the slash in option B) or turned into a group.
- Label counts and Type counts are the maintainer's; I re-read only the org's Type names (`Task`, `Bug`, `Feature`) and the repo's label list (19 labels on holocron, including `epic` and `cli`, which are not canonical).
- Whether `question`, `invalid` and the other stock labels are used in the other org repos, and whether GitHub Discussions are enabled anywhere.
- That `actions/labeler` can be run for fork PRs safely; every PR in this repo is same-repo, so I did not look.
- Whether `github/issue-labeler` `sync-labels: 1` would remove an `area:` label if both tools managed the same name; the area labels are not in `labeler.yml`, so it should not, but I did not run it.
- The plugin count (22) was read from `ls plugins`; `AGENTS.md` says 21. Client, config and util counts were not recounted.
- That the mapping `bug`/`enhancement`/`chore` covers the issues: an issue carrying two of them is possible and its number is unknown until the dry run.
