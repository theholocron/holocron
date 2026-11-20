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

## Decisions (maintainer)

1. Kind labels stay on pull requests, set from the title's type by `labeler.yml`. On issues, kind is Type (Bug, Feature, Task).
2. Area labels with a prefix are added, automated from the changed folders where possible.
3. Existing issues are backfilled: `bug` to Bug, `enhancement` to Feature, `chore` to Task; Type is relied on afterwards.

### Answers to the open questions (maintainer, 2026-11-19)

1. **Sentinel applies the area labels**, for pull requests (from the changed folders) and also for issues.
2. **Format is `area:<name>`, no space.** There is no existing standard to match: `priority: high` appears only as a spelling in `issues-migration.ts` and is not a live label.
3. **The set of areas.** `cli` is one area although it spans five packages (`cli`, `astromech`, `datapad`, `dagobah`, `kyber`). Each app (`sentinel`, `comlink`, `council`) is its own area. `area:configs` is the `configs/` group. The root's own config files (`holocron.config.ts`, `.holocron/**`, `turbo.json`, `pnpm-workspace.yaml`, the root ESLint config) get `area:tooling`.
4. **Where the list lives.** `.holocron/repo.ts` as `repo.labels.areas` (name to folder patterns). Issues have no changed files, so a second key, `repo.labels.scopes`, maps a title scope (`feat(sentinel)`) to an area, and `holocron new issue` gains `--area`. Also a requirement: the `work` commands (spec `tool-work-commands`, issue #2429) must update the issue's area labels as the work is done, from the PR's changed folders.
5. **Kind labels** (`bug`, `enhancement`, `chore`) stay on old issues; nothing is stripped.
6. **The backfill** is a dry-run-first writer probe the maintainer runs. It covers more than the issue Type: it sets Type and area where derivable, fills project and milestone where a source exists, and prints a list of every issue still lacking project, milestone, Priority or Effort, grouped by field, so the maintainer can hand it to someone to decide. The agent never runs it against the live service. The number of issues missing a project or milestone has not been counted.

## Area labels

### Which areas

Enumerated from the tree and settled by the maintainer (Answers 3 and 4). The label is `area:<name>`, no space.

| Area label           | Paths                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `area:cli`           | `cli/**` (the packages `cli`, `astromech`, `datapad`, `dagobah` and `kyber` are one area)                                                              |
| `area:sentinel`      | `apps/sentinel/**`                                                                                                                                     |
| `area:comlink`       | `apps/comlink/**`                                                                                                                                      |
| `area:council`       | `apps/council/**`                                                                                                                                      |
| `area:plugins`       | `plugins/**` (22 directories on disk, not 21: `holocron-plugin-turbo` is the one the repo layout in `AGENTS.md` omits). One label, not one per plugin. |
| `area:clients`       | `clients/**` (the folder also holds `scripts/`)                                                                                                        |
| `area:configs`       | `configs/**` (the `configs/` group)                                                                                                                    |
| `area:utils`         | `utils/**`                                                                                                                                             |
| `area:observability` | `observability/**`                                                                                                                                     |
| `area:skills`        | `skills/**`, `.claude/skills/**`                                                                                                                       |
| `area:themes`        | `themes/**`                                                                                                                                            |
| `area:docs`          | `docs/**` except `docs/wiki/**`, and `fern/**` (the documentation site and its config)                                                                 |
| `area:specs`         | `docs/wiki/**` (specifications and decisions), `.notes/**`                                                                                             |
| `area:ci`            | `ci/**`, `.github/workflows/**` (generated copies of `ci/`)                                                                                            |
| `area:tooling`       | The root's own config files: `holocron.config.ts`, `.holocron/**`, `turbo.json`, `pnpm-workspace.yaml` and the root ESLint config                      |

`fern/`, `ci/`, `.notes/`, `.claude/` and `.holocron/` were missing from the first list and are placed above. Other root files (`package.json`, the lockfile) and the root `scripts/` folder get no area; the `dependencies` kind already says the first. The exact patterns are the ones in `repo.labels.areas` (Answer 4), which is the one list; this table is its starting content.

A pull request touching several folders gets several labels. A pull request touching none of the listed paths gets none; that is correct, not a failure.

### Label format

Decided: `area:<name>`, no space (Answer 2). There is no existing standard to match: `priority: high` appears only as a spelling that `splitLabels()` in `issues-migration.ts` parses, and is not a live label. Kind labels keep their names, so nothing existing is renamed. The family has one colour and the description `Changes under <paths>`; the colour is a detail for the implementing change. Whether Linear treats the colon as plain text or as a group is Not verified.

### `docs` against `documentation`

With the prefix the two no longer collide: `documentation` stays the **kind** (a `docs:` PR), `area:docs` is the **place** (the site). They routinely differ: a `docs(specs):` PR is kind `documentation` and area `area:specs`; a `feat(docs):` PR is kind `enhancement` and area `area:docs`. Keep both names and make the descriptions say it (`documentation`: `Documentation only (kind)`; `area:docs`: `The documentation site and its config`), renaming nothing. The same argument covers `ci` the kind against `area:ci`.

### Who applies them

Decided: Sentinel (Answer 1), for pull requests and for issues. The other options were `actions/labeler` in a workflow (a new task, caller and frozen-reusable question, and a runner for every PR) and extending `issue-labeler` (it reads text, not paths, so it cannot do this); neither was chosen.

- **Pull requests.** A Sentinel action (`apps/sentinel/src/actions/area-labels/`) reads the PR's changed files through the API, maps them by the declared patterns and adds and removes `area:` labels. A pure `planAreaLabels(files, areas)` plus a thin API layer, like `pr-feed`. It needs only the diff and the API, which is Sentinel's side of `process-sentinel-and-actions-roles` (#2263), and it is a quiet `skipped` when the repo declares no areas.
- **Issues.** An issue has no changed files, so the map has a second key, `repo.labels.scopes`, from a title scope to an area (`feat(sentinel)` to `area:sentinel`). Sentinel applies the label on an issue's `opened` and `edited` delivery from its title's scope. A title with no scope, or a scope the map does not name, gets no label. `holocron new issue` gains `--area <name>`, which adds the label at filing and is checked against the declared names. The title scopes are topics, not folders (see Problem), which is why `scopes` is an explicit map and never a guess.
- **Work commands.** The `work` commands (spec `tool-work-commands`, issue #2429) must update the issue's area labels as the work is done, from the changed folders of the PR that does it, through the same `planAreaLabels()` so there is one mapping. They only add labels and never remove one a person put there. This spec states the requirement; the commands themselves are built under #2429.

The map is declared in config, names only, in `.holocron/repo.ts` (`satisfies RepoConfig`): `labels: { areas: { cli: ["cli/**"], ... }, scopes: { sentinel: "sentinel", ... } }` (Answer 4; the exact shape is settled by the implementing change). `setup` makes the labels, `doctor repo` reports a declared one that is missing, and Sentinel reads the same map. A repo that declares no `areas` gets nothing: no label, no workflow, no change.

Open for the implementing change: the dev Sentinel App's installed permissions (it needs `issues` and `pull_requests` write; Not verified), and that production Sentinel is down (#1100), so this works only on the dev instance until it is back.

**Which repositories.** The kind labels (`CANONICAL_LABELS`, `labeler.yml`) are org-wide. **Area labels are not**, because they name this repo's folders. They apply to repos that declare `areas`, which today is holocron only. `CANONICAL_LABELS` does not change. `doctor repo` reads canonical labels with `flagExtra: false` (labels outside the set are left alone), so a per-repo `area:x` label is never a finding; the doctor gains a row only for a declared area that is missing.

## Kind: Type on issues, labels on pull requests

- `labeler.yml` is unchanged: it keeps labeling PRs (and only PRs, as today).
- On an issue, kind is Type. Types exist only on issues, never PRs, which is why both mechanisms stay.
- `bug`, `enhancement`, `chore` on an issue are no longer set by anything once `new issue` sets Type. Existing ones are left in place (see Backfill).
- The mapping `bug` to Bug, `enhancement` to Feature, `chore` to Task is the only one decided. The other kind labels that appear on issues (`refactor` 17, `documentation` 19, `ci` 44, `test` 4, `performance` 1, `dependencies` 2) have no Type of their own; Q1 below.

## Retiring a label without losing it

Deleting a label strips it from every issue and pull request that had it, and `setup` does exactly that to `STALE_LABELS` (`syncLabels(CANONICAL_LABELS, STALE_LABELS)`, and `doctor repo` reports `stale label X (setup removes it)`). So there are three states, and a label moves down only deliberately:

| State                     | How                                                  | Effect                                                                                          |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| In use                    | In `CANONICAL_LABELS`                                | `setup` makes it, `doctor` checks colour and description                                        |
| **Retired (no deletion)** | Out of `CANONICAL_LABELS`, **not** in `STALE_LABELS` | `setup` and `doctor` ignore it (`flagExtra: false`); existing items keep it; nothing applies it |
| Deleted                   | In `STALE_LABELS`                                    | Removed from every item that had it, everywhere `setup` runs                                    |

Recommendation: retire by removing from `CANONICAL_LABELS` and stay out of `STALE_LABELS` unless the label has no use in any org repo (count first with `gh label list` and `gh issue list --label` per repo; the figures given are for holocron only, Not verified for the others). A retired label has no marker in the code; an inline comment next to the list is enough, and a `RETIRED_LABELS` constant would be a third list to keep with no consumer. A rename (`gh label edit --name`) also keeps every attachment, which is how `cli` (2 issues) becomes `area:cli`.

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
| `cli`                           | 2/0    | Rename to `area:cli` when area labels land; keeps both issues.                                                                                     |
| `wontfix` 6/28, `duplicate` 1/0 | in use | Keep.                                                                                                                                              |
| `released` 230/802              | in use | Keep (set by the release workflow, not a kind).                                                                                                    |

## What changes for Linear

Read in `plugins/holocron-plugin-linear/src/provider/setup.ts`, `provider-config.ts` and `plugins/holocron-plugin-github/src/capabilities/issues-migration.ts`.

- `provider linear setup` makes the labels the `labels` option lists, taking a colour from `CANONICAL_LABELS` by name (`colorOf()`). Linear has **no issue Type**, so kind there stays a label (`bug`, `enhancement`, `chore`): the canonical list must keep those three, which this spec does not touch. An `area:cli` label would get no canonical colour (it is not in `CANONICAL_LABELS`) and is made with Linear's default unless `colorOf()` learns the area family; a small follow-up, not a blocker.
- `IssueRecord` carries `labels: string[]` and no type or kind. So today a GitHub issue migrated to Linear keeps its `bug` label, and one with a Type but no label arrives with **no kind at all**. Once issues rely on Type this becomes a loss. Recommended follow-up, separate from this spec's implementation: add an optional `kind` (`bug`, `feature`, `task`) to `IssueRecord`; the GitHub export fills it from Type, falling back to the label map; the Linear import writes the kind label; the GitHub import and `sync` set Type from `kind` and do not write the kind label. Until then, the backfill must happen _before_ any migration that depends on Type, and the labels left on old issues (below) keep those migrations whole.
- `splitLabels()` already turns a `priority: <level>` label into the Priority field; `area:x` is not matched by it and travels as an ordinary label both ways. Whether Linear treats `area:cli` as plain text or as a group, and whether the `:` is accepted, is Not verified.

## What `holocron new issue` does

Today it sets labels and no Type (`run-issue-create.ts` passes `labels`). A `--type` option and the provider method behind it belong to a separate spec; this one only fixes what they must honour: GitHub gets Type, Linear gets the kind label for the same value, and a bare `--label bug` on a GitHub target is a hint to set Bug and not to add the label. Setting the Type needs the issue REST update (`type` field, Not verified against the live API: this spec ran no write) or GraphQL `updateIssue` with an `issueTypeId`.

## Backfill

Writes to live issues. Described here; **not run by this spec's author, and the agent never runs it against the live service** (Answer 6).

- **What it sets.** For each issue in `theholocron/holocron` (Q2 below for other repos) it fills what it can derive:
  - **Type**: where there is none, `bug` gives Bug, `enhancement` gives Feature, `chore` gives Task. An issue that already has a Type is never changed (the 184 that do). An issue with more than one of the three labels is listed and left for a person.
  - **Area**: where derivable, from the title's scope through `repo.labels.scopes`, or from the changed folders of a pull request that closed the issue. Added only.
  - **Project and milestone**: filled where a source exists (the board or milestone of a linked pull request or a sibling, as the implementing change defines it); an issue with no source is left and listed.
  - Closed issues are included so history filters work. Pull requests are skipped (GitHub's issues API returns them, so they are filtered).
- **What it prints.** A table (issue, current labels, proposed Type and area, proposed project and milestone), counts per mapping, the skipped ones with the reason (already typed, ambiguous, no kind label), and then a list of **every issue still lacking a project, milestone, Priority or Effort, grouped by field**, so the maintainer can hand that list to someone to decide. The probe never invents a Priority or an Effort.
- **Scale.** 310 kind-label occurrences against 184 typed; the number to change is smaller (overlap unknown, read by the dry run). **The number of issues missing a project or a milestone has not been counted.** The dry run is what counts it.
- **How.** A writer probe on the GitHub plugin, `holocron probe github issue-types` (the name may widen, since it now sets more than Type), with `writes: true` so it follows the probe rules: it lists the plan and does nothing on `--dry-run`, asks first without `--yes`, goes through `ctx.write`, never repeats a done write, and stops cleanly on a rate limit and reports what is left. It is **dry-run first**: the maintainer reads the dry run, may attach it to the issue, and only then starts the real run. It is idempotent: a second run changes nothing. A one-off `gh` script is rejected: "anything that can be automated belongs in the CLI".
- **Who runs it.** The maintainer, with a token that can write issues (the `github.issues` token). Nobody else and no schedule: it is a one-time repair.
- **After.** The kind labels are **left on the issues** (Answer 5). Nothing is lost, filters by `label:bug` keep working, and Linear migration keeps its source of kind. `new issue` stops adding them once it sets Type.

## Rollout

One pull request is one focused change; the spec is this PR. In order, each after the previous is merged:

1. **This spec** (design only).
2. **Area declaration and labels**: the `repo.labels.areas` shape (`RepoConfig`), `setup` makes the labels, `doctor repo` row, tests, docs (`cli/cli/README.md`), `.holocron/repo.ts` declares this repo's areas; rename `cli` to `area:cli` by hand after merge.
   **Built** (#2430 part 2): `repo.labels.areas` and `scopes` are validated at config load; `setup` makes the labels through the new optional `Source.ensureLabels()` (create only); `doctor repo` has a `repo-area-labels` row; `.holocron/repo.ts` declares the fifteen areas. The mapping moved to `cli/cli/src/area-labels/` and is exported from `@theholocron/cli` (`areaLabelsForFiles`, `areaLabelsForTitle`, `areaForScope`, `titleScopes`, `pathMatches`, `areaLabelDefs`, `AREA_PREFIX`); items 3 and 5 import those, so there is one mapping.
3. **Area labeling on PRs**: the Sentinel `area-labels` action (or the `actions/labeler` workflow), with the pure planner and its tests; deploy on the dev instance first and check a real PR.
   **Built** (#2430 part 3): the Sentinel action, for pull requests and for issues (the `issues` event is new in the router). Rules decided here: a pull request's file areas come first (most-changed folder first) and its title's scopes add; at most four `area:` labels on an item, counting a person's; add-only; a label the repo lacks is reported, never made; a closed item or a bot's delivery does nothing. Deploying to the dev instance, subscribing the App to the `issues` event and checking a real pull request and issue are the maintainer's steps and are Not verified.
4. **Type on `new issue`** (its own spec, `--type`), and the Linear `kind` follow-up.
5. **Backfill probe** and its docs; then the maintainer's dry run and real run.
   **Built** (#2430 part 5): `holocron probe github issue-types` (`plugins/holocron-plugin-github/src/probes/issue-types/`). Sources: Type from the kind labels (two kind labels are listed and left, a Type is never overwritten); area from the title scope, and for pull requests, with `--pull-requests`, from the changed files (the spec said pull requests are skipped, so they stay skipped by default); milestone from the issue's parent, else `--milestone`; project from `--project`, the last two only for an issue in an explicit `--issues` or `--since` window. A linked closing pull request and siblings are not used as a source. It lists what still lacks a project, milestone, Priority or Effort, by field. The probe's options follow a bare `--` (`holocron probe github issue-types --dry-run -- --since ...`). The dry run and the real run are the maintainer's; the number of issues missing a project or milestone is still not counted.
6. **Retire the stock labels** (`question`, `invalid`) by editing `CANONICAL_LABELS` and its test; no deletion.
7. Optional: copy a PR's areas to the issues it closes.

Step 5 should wait for step 4 so that no new unlabeled, untyped issue appears behind it.

## Open questions for the maintainer

Resolved: where area labels are applied (Answer 1), the label format (2), the set of areas (3), the config key (4), what happens to kind labels on old issues (5) and what the backfill covers and who runs it (6). Still open:

1. **Other kind labels on issues** (`refactor`, `documentation`, `ci`, `test`, `performance`, `dependencies`): map to Task, leave unmapped, or put a new Type in the org?
2. **Backfill scope:** holocron only (assumed), or every org repo?
3. **Retiring:** `question` and `invalid` are retired without deletion (recommended). Is that count zero in the other org repos too? Keep `good first issue` and `help wanted`, and `triage`, as recommended?
4. **Linear `kind` on `IssueRecord`:** do the follow-up now, or accept losing the kind of a Type-only issue on migrate until it is needed?

## Not verified

- No write was made, so the following were not tried: setting a Type through the REST or GraphQL API, the Sentinel App's installed permissions, and whether a label named `area:cli` is accepted unchanged by Linear (colon, space, and the slash in option B) or turned into a group.
- Label counts and Type counts are the maintainer's; I re-read only the org's Type names (`Task`, `Bug`, `Feature`) and the repo's label list (19 labels on holocron, including `epic` and `cli`, which are not canonical).
- Whether `question`, `invalid` and the other stock labels are used in the other org repos, and whether GitHub Discussions are enabled anywhere.
- That `actions/labeler` can be run for fork PRs safely; every PR in this repo is same-repo, so I did not look.
- Whether `github/issue-labeler` `sync-labels: 1` would remove an `area:` label if both tools managed the same name; the area labels are not in `labeler.yml`, so it should not, but I did not run it.
- The plugin count (22) was read from `ls plugins`; `AGENTS.md` says 21. Client, config and util counts were not recounted.
- That the mapping `bug`/`enhancement`/`chore` covers the issues: an issue carrying two of them is possible and its number is unknown until the dry run.
