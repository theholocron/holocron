---
status: accepted
issue: theholocron/holocron#1368
blocked-by: []
related:
  - theholocron/holocron#1373
  - theholocron/holocron#1374
  - theholocron/holocron#1376
  - theholocron/holocron#1369
  - theholocron/holocron#1381
  - theholocron/holocron#1227
  - theholocron/holocron#1200
  - theholocron/holocron#1482
  - theholocron/holocron#1483
  - theholocron/holocron#1505
  - theholocron/holocron#1511
  - theholocron/holocron#1512
  - theholocron/holocron#1513
  - theholocron/holocron#1514
  - theholocron/holocron#1515
---

# API documentation as a measured CI gate, generated from TSDoc

TSDoc comments on the public API are the one source of truth. The API reference is generated from them with TypeDoc
into the Starlight site, and a docs-coverage number is reported on every PR the way test coverage is. This spec
records how the pieces fit, as built; the goal, measurement and rollout steps are in
[#1368](https://github.com/theholocron/holocron/issues/1368), which it closed.

## What shipped

| Piece                                                             | State                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `holocron probe docs coverage`, `patch`, `lcov`                   | Done (#1373). One TypeDoc pass per public package entry point (`src/index.ts`, or root `index.ts`), counted by `countSymbols()`: functions, classes, interfaces, type aliases, variables, enums and their public members. A symbol is documented when it has a summary or a block tag. `docs patch` fails for each exported symbol whose declaration line a PR adds or changes without a doc comment. |
| `--lcov <path>` on `docs coverage` and `docs patch`               | Done (#1482). Writes the lcov report from the same measurement, with no prompt, so CI and a person use one command.                                                                                                                                                                                                                                                                                   |
| The `documentation` Codecov flag                                  | Done (#1482, #1514). Uploaded by the Docs coverage workflow (`docs coverage --lcov coverage/docs.lcov`) on every PR and on pushes to `alpha`. Statuses: `codecov/patch/documentation` (target 100%) and `codecov/project/documentation` (target `auto`).                                                                                                                                              |
| `codecov/patch/documentation` as a required check                 | Done (#1513): listed in `extraRequiredChecks` and written into the ruleset by `holocron repo setup`. `codecov/project/documentation` is not required.                                                                                                                                                                                                                                                 |
| The per-repo switch, `repoValidation.docsCoverage`                | Done (#1483). `off` (default), `warn`, `required`; this repo sets `required`.                                                                                                                                                                                                                                                                                                                         |
| Per-task job switch (`jobs: { <job or alias>: false }` on a task) | Done (#1369). `platform.repoValidation` has the jobs `adrs` and `docsPresence` (alias `docsEnforcement`), and `retiredJobs: ["registry"]`. A switched-off job's check still reports green, so a required check never goes missing.                                                                                                                                                                    |
| The package-registry check                                        | Retired (#1381, #1227). Nothing is left to switch off in this repo; `retiredJobs` only keeps a stale reusable workflow green until it is re-synced.                                                                                                                                                                                                                                                   |
| Generated API reference                                           | Done for every package with a TypeScript API: the pilot `utils/array-utils` (#1374), then `utils` (#1506), `clients` (#1507), `configs`, `plugins`, `cli`, `astromech`, `datapad`, `observability` and `docs-theme` (#1509), and `astro-config` through `skipErrorChecking` (#1510).                                                                                                                  |
| Backfill of the doc comments                                      | Done (#1487 to #1503, #1505): the public API of every package is documented.                                                                                                                                                                                                                                                                                                                          |

Measured with the probe: 1,613 of 4,452 symbols documented (36%) on 2026-10-31, before the backfill, 54 s for the whole
repo on a laptop; 4,029 of 4,029 (100%) after it. The denominator fell because a package that re-exports another one
was counting the other package's compiled declarations a second time (decision 10). The 3,812 / 33% in the issue was a
rougher TypeDoc count; the probe's number is the one to track.

## (a) What `docs patch` enforces and what a Codecov `docs` flag adds

Both read the same measurement (`countSymbols()`); the question is what the flag adds on top.

**`docs patch` enforces** the rule, binary: a symbol whose declaration line the PR touches must have a comment, else
the check fails and prints `file:line` for each. It is deterministic and depends on nothing outside the repo.

**The Codecov flag adds**, from the same data:

- a **patch percentage** and a **project percentage** on every PR, next to the test numbers reviewers already read,
  and the trend of the project number on `alpha`;
- Codecov's own diff view marking the undocumented declaration lines in the PR;
- a threshold and a target that can be tuned or relaxed (`informational: true`) in `codecov.yml` without a workflow edit.

It adds **no new information**: a line is "missed" exactly when the probe reports that symbol.

**One rule, two surfaces.** The two agree on what a PR touches: Codecov's patch is the lcov `DA` lines inside the PR's
diff, and the probe's is `addedLines()` over `git diff -U0 base...HEAD`, both against a symbol's declaration line. A PR
that only adds a comment above an existing declaration touches neither; a PR that adds or edits the declaration line
touches both.

**Decision: the flag becomes the CI gate; the probe stays as the human tool; they share one measurement.**

- Reviewers already look at Codecov, which owns "only what this PR touched" and is the one place a coverage number is
  reported.
- The probe answers "what is undocumented in this package?" in seconds, with file and line, without pushing and waiting
  for CI. It is the right tool for the backfill (step 5 of the issue), which is the long job.
- The lcov comes from the probe's code, not a second parser (see item 2).
- **The probe step left the workflow once the flag had posted reliably.** Both `documentation` statuses posted on each
  of the last 22 consecutive PRs merged to `alpha` (#1488 to #1510), against the bar of five (decision 7). The Docs
  coverage workflow now runs `docs coverage --lcov`, which writes the report and does not fail (#1514); `docs patch`
  stays in the CLI as the human tool.

So the flag took over the gating and the probe stayed as the human tool. A pull request from a fork has no OIDC token,
so it never uploads and has no gate; this repo takes none.

## (b) One lcov entry per symbol, as a Codecov flag

**Format.** `toLcov()` already writes `SF:<repo-relative path>` and one `DA:<line>,<hit>` per symbol (two symbols on one
line count as documented only when both are), with `LF`/`LH`. Paths are repo-relative because the probe runs TypeDoc
with `--basePath <repo root>`, which is what Codecov needs to match files in the diff. Only declaration lines get a
`DA`, so only those lines count towards the percentage.

**Flag name.** `documentation` A flag named `docs` would produce the context `codecov/patch/docs`, which
already exists: the `docs` _component_ (`docs/**`) posts it. Flags and components share the status-context namespace.
The generator also already treats the `docs/` folder as flagless (`FLAGLESS_FOLDERS`), so `docs` is taken in two ways.

**Files.** One lcov file for the whole repo, `coverage/docs.lcov`, in one `do-upload --flag documentation`.

**Upload, alongside the per-package flags.**

- Reuse the `codecov-upload` composite action (`create-commit`, `create-report`, then `do-upload --flag`) with
  `uploads: [{"flag":"documentation","files":"coverage/docs.lcov"}]`. Same OIDC path as the unit-test job. Without
  `create-commit`/`create-report` Codecov queues an upload and never posts a status, so the composite is the only
  supported route; do not call `do-upload` directly.
- It runs in the **Docs coverage** workflow, a separate job from the unit tests (the unit-test job is skipped for
  unaffected groups and has no TypeDoc). The job needs `permissions: id-token: write` and runs on every PR, so the flag
  always has a report for the head commit (the docs job has no `paths:` filter, which is why it does not need
  `empty-upload`).
- **A `push` trigger on `alpha`**, so `alpha` has a docs report to compare a PR against. Release commits are
  `[skip ci]` and upload nothing, which `carryforward: true` on the flag covers, as for every package flag. A PR from a
  fork has no OIDC token: the upload step is skipped.
- The upload step does not run only on success (`if: ${{ !cancelled() }}`).

**Not breaking the required `codecov/patch` and `codecov/project`.** Both are scoped with `flags:` to the package flags
by the generator (`scopeAggregateStatuses`), so a new flag outside that list does not count towards them. The
generator's `codecovFlagNames()` therefore does not include `documentation`; it is added to `flag_management` and given
its own statuses as a separate step (`ensureDocumentationCoverage()`), not through the package list. The statuses
(`codecov/patch/documentation`, `codecov/project/documentation`) are informational for `warn` and not for `required`.
`codecov/patch/documentation` is a branch-protection required check (decision 9); `codecov/project/documentation` is
not.

**Verified on real uploads** (the first was the Docs coverage run on #1482):

1. the flag and its two statuses appear with the expected names, and `codecov/patch` / `codecov/project` (the required
   ones) kept their names and values. Yes;
2. the _component_ statuses: a component is path-based and counts every flag, so the flag may leak into
   `codecov/patch/<component>`. No component status failed on the PRs that were looked at, but the component
   _percentages_ were not inspected. If the `docs` component's number ever shows the flag, set `flag_regexes` on the
   components to leave `documentation` out (decision 5);
3. Codecov accepts a `DA` line that is not an executable line of the file. Yes: the patch and project percentages are
   computed from them.

**Pitfalls that cost time and are worth knowing.**

- `--lcov` needs a CLI built from a tree that has it; an older built CLI ignores the flag and leaves a stale
  `coverage/docs.lcov` from an earlier run, which then reads as a fresh report.
- Rebuild the CLI after switching branches, or the lcov shows another branch's line numbers.
- TypeDoc cannot attach a comment to a member of an inline object type written on one line
  (`labels?: { inProgress: string }`); the type has to be laid out one member per line to be documented.
- A package that re-exports another one sees the other's compiled `dist/*.d.mts`, where inline members have lost their
  comments (decision 10).

## (c) TypeDoc generation

**Tool.** `starlight-typedoc` (wraps `typedoc-plugin-markdown`), as in the pilot #1374. It runs in Starlight's
`config:setup` hook, writes Markdown into the content collection and fills the sidebar, with one
`createStarlightTypeDocPlugin()` instance per package. The wiring is `apiReference({ createPlugin, root, package })` in
`@theholocron/astro-config`; the site's own `astro.config.ts` passes in the factory because the package ships
TypeScript source.

**Where generated pages live.** `docs/src/content/docs/<group>/<package>/api/`, next to the hand-written overview.

**Built, not committed.** Generated on every `astro build` / `astro dev` and gitignored, so the reference cannot drift
from the source and PR diffs show only the TSDoc. Cost in the pilot: about +0.4 s per small package. The plugin writes
into `src/content/docs`, so the ignore line is required. Decision 4.

**Rollout, by group, once each was backfilled** (the 36% backlog would otherwise have published near-empty pages). The
loop is a list in `astro.config.ts` (`referencesFor(group, names)`), not 75 hand-written blocks. Packages with no
TypeScript API (`configs/tsconfig`, `configs/browserslist-config`, `skills`) and the private apps (`comlink`,
`sentinel`) keep their hand-written pages. `astro-config` is generated with `skipErrorChecking`, because its types come
from Starlight sources TypeDoc cannot type-check (#1510). `markdownlint-config` and `holocron-plugin-fern` have no
sidebar entry, so there was nothing to hang a reference on. Whole-site build with every reference: 1,440 pages in
about 45 s.

The generation itself is **not** gated by the coverage number: the gate measures the source, the reference is a
consumer of it.

Hand-written pages that still repeat the reference are tracked in #1512.

## (d) The per-repo switch

The issue proposed `repoValidation: { packageRegistry, docsEnforcement: "required" | "warn" | "off" }`. Two things have
changed since:

1. **`packageRegistry` has nothing left to switch** (#1381 retired the check). Drop it.
2. **`docsEnforcement` is taken.** It is already the alias of the `docsPresence` job (a PR that adds a public package
   without a docs change), a boolean in the existing `jobs` map. Reusing the name for API-docs coverage would make one
   word mean two things, and `jobs: { docsEnforcement: false }` in this repo's config already means the first.

What the new switch has to do is three-valued, which the boolean `jobs` map cannot say:

| Value      | `holocron probe docs patch`        | Codecov `documentation` statuses | `repo setup` writes the flag |
| ---------- | ---------------------------------- | -------------------------------- | ---------------------------- |
| `required` | fails for each undocumented export | not informational                | yes                          |
| `warn`     | reports, always exits 0            | informational                    | yes                          |
| `off`      | skipped, nothing measured          | none                             | no (nothing is removed)      |

The Docs coverage workflow is hand-maintained and no longer runs `docs patch` (decision 11), so the value governs the
human command and what `repo setup` writes into `codecov.yml`; the CI gate is the Codecov status.

"Required" in the sense of a **branch-protection required check** is a ruleset change that goes through
`extraRequiredChecks` and `holocron repo setup` (decision 9); the value alone never touches the ruleset.

Shape (decision 3): a top-level key in `holocron.config.ts`, validated by the config schema and
typed in `defineConfig`:

```ts
repoValidation: {
  /** API doc-comment coverage of the code a PR changes. Default "off". */
  docsCoverage: "off" | "warn" | "required";
}
```

- **Default `off`**, so a repo that does not set it sees no change. This repo sets `"required"`.
- It drives the generated pieces (`codecov.yml` statuses and the `docs patch` exit code), not the other way round, so
  the repo's config stays the contract.
- It sits next to, and does not replace, `jobs` (which stays the way to switch a registry sub-job off).

## Rollout

| #   | PR                                                                                     | Outcome |
| --- | -------------------------------------------------------------------------------------- | ------- |
| 0   | This spec (#1472)                                                                      | Merged  |
| 1   | The pilot, `utils/array-utils` reference (#1374)                                       | Merged  |
| 2   | `--lcov` on the probe, uploaded as `documentation` (#1482)                             | Merged  |
| 3   | The `repoValidation.docsCoverage` switch (#1483)                                       | Merged  |
| 4   | Backfill of every package (#1487 to #1503, #1505)                                      | Merged  |
| 5   | Generated reference for the other groups (#1506, #1507, #1509, #1510)                  | Merged  |
| 6   | `codecov/patch/documentation` required (#1513), the probe step dropped from CI (#1514) | Merged  |

## Decisions

The maintainer's goal, in their words: add TSDoc to the code so docs get a coverage number, enforce that coverage, use
the TSDoc as the source of truth and build the documentation site from it. Each question the first draft asked was
settled with the tradeoff, so the choice can be reversed in one place.

1. **Flag name: `documentation`.** Spelled out, not `docs`: a flag named `docs` posts `codecov/patch/docs`, which the
   `docs` component already posts. `documentation` shares no context with anything.
2. **The probe gets a `--lcov <path>` option.** CI runs the same command people run, so there is one measurement path.
   _Tradeoff:_ it adds a yargs option and a field on `ProbeContext` (a small change in the probe command), against CI
   calling `docs lcov` with no CLI change but a second entry point to keep in step. `docs lcov` stays as it is.
3. **The switch is a top-level `repoValidation.docsCoverage: "off" | "warn" | "required"`, default `off`.** This repo sets
   `"required"`: `docs patch` fails on a miss and the Codecov statuses are not informational. The value does not touch
   the ruleset's required checks (decision 9 does). _Tradeoff:_ a top-level key is easy to find and to document and
   holds three states; the alternative, a string in the existing `jobs` map, avoids a new key but stretches a boolean map
   and hides the setting among task options.
4. **Generated pages are built at docs-build time and not committed.** The reference then cannot drift from the source,
   which is the "TSDoc is the source of truth" goal, and PR diffs show only the TSDoc. _Tradeoff:_ every docs build runs
   TypeDoc (about 45 s for all 68 references) and needs the packages built first, against committed output that is
   fast to build but can go stale and floods diffs.
5. **Components are left as they are.** A component counts every flag, so the `documentation` flag may show up in
   `codecov/patch/<component>`. Those are informational, so nothing blocks; `flag_regexes` are added only if the
   component percentages show it. _Tradeoff:_ excluding up front is a change to 76 components for a problem that may
   not appear.
6. **Targets:** `codecov/patch/documentation` target 100% with no threshold (a touched export is documented),
   `codecov/project/documentation` target `auto` (it must not drop; it started at 36% and the backfill raised it).
7. **The probe step leaves the workflow after five consecutive PRs** on which both `documentation` statuses posted
   normally. Done at 22 (#1514).
8. **The upload also runs on pushes to `alpha`**, so a PR has a base report to compare against.
9. **`codecov/patch/documentation` is a required check, set through `extraRequiredChecks` in `holocron.config.ts` and
   written into the ruleset by `holocron repo setup`** (#1513). `codecov/project/documentation` is not: its `auto` target
   would only block on a drop in the total. A fork PR never uploads, so the status would stay pending for it; this repo
   takes none.
10. **A symbol whose source is a `dist/` file is not counted** (#1505). A package that re-exports another one (a plugin
    re-exporting its client) sees the other's compiled `.d.mts`, where inline members lost their comments; the symbol is
    measured in its own package, and the `dist` lines can never be hit in the lcov.
11. **The workflow runs `docs coverage --lcov`, not `docs patch --lcov`** (#1514): it writes the report for the upload
    and does not fail. The Codecov status is the only CI gate; `docs patch` stays in the CLI for a person to run before
    pushing.

## Follow-ups

- #1512: trim the hand-written package pages that the generated reference now duplicates.
- #1515: warn when a `feat` changes a package without a docs change, with a `[skip docs] <reason>` marker as the escape
  hatch (step 6 of the issue).
