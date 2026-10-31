---
status: proposed
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
---

# API documentation as a measured CI gate, generated from TSDoc

TSDoc comments on the public API are the one source of truth. The API reference is generated from them with TypeDoc
into the Starlight site, and a docs-coverage number is reported on every PR the way test coverage is. This spec
settles how the pieces fit before more code is written; the goal, measurement and rollout steps are in
[#1368](https://github.com/theholocron/holocron/issues/1368).

## What exists

| Piece                                                             | State                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `holocron probe docs coverage`                                    | Done (#1373). One TypeDoc pass per public package entry point (`src/index.ts`, or root `index.ts`), counted by `countSymbols()`: functions, classes, interfaces, type aliases, variables, enums and their public members. A symbol is documented when it has a summary or a block tag. |
| `holocron probe docs patch`                                       | Done (#1373). Fails for each exported symbol whose declaration line a PR adds or changes and that has no doc comment. Runs in the hand-maintained `.github/workflows/sourceQuality.docsCoverage.yml` as `Docs coverage / Patch`. **Not required** (not in `extraRequiredChecks`).      |
| `holocron probe docs lcov`                                        | Done (#1373). Writes `coverage/docs.lcov` with `toLcov()`: one `SF` per file, one `DA:<line>,<0\|1>` per symbol at its declaration line. Nothing uploads it yet.                                                                                                                       |
| Per-task job switch (`jobs: { <job or alias>: false }` on a task) | Done (#1369). `platform.repoValidation` has the jobs `adrs` and `docsPresence` (alias `docsEnforcement`), and `retiredJobs: ["registry"]`. A switched-off job's check still reports green, so a required check never goes missing.                                                     |
| The package-registry check                                        | Retired (#1381, #1227). Nothing is left to switch off in this repo; `retiredJobs` only keeps a stale reusable workflow green until it is re-synced.                                                                                                                                    |
| Pilot: generated reference for `utils/array-utils`                | Open PR #1374, built on the `apiReference()` helper in `@theholocron/astro-config` (#1376).                                                                                                                                                                                            |

Measured on 2026-10-31 with the probe from this checkout: 1,613 of 4,452 symbols documented (36%), 54 s for the whole
repo on a laptop. The 3,812 / 33% in the issue was a rougher TypeDoc count; the probe's number is the one to track.

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
- **The probe step stays in the workflow for a few PRs after the flag exists.** A required Codecov check hangs
  sometimes (`codecov/patch/misc-utils` stuck pending on #1421; "not posting commit statuses" on #1346). The probe is
  deterministic. Once the `docs` flag has posted reliably, the probe step is dropped from the workflow and the command
  stays in the CLI. How many PRs counts as reliable is settled in decision 7.

So the flag does not replace the probe. It sits next to it, then takes over the gating.

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
  unaffected groups and has no TypeDoc). The job needs `permissions: id-token: write` and runs the lcov step on every
  PR, so the flag always has a report for the head commit (the docs job has no `paths:` filter, which is why it does not
  need `empty-upload`).
- **A new `push` trigger on `alpha`** for the upload step only (the `patch` step is PR-only), so `alpha` has a docs
  report to compare a PR against. Release commits are `[skip ci]` and upload nothing, which `carryforward: true` on the
  flag covers, as for every package flag. A PR from a fork has no OIDC token: the upload step is skipped with a note and
  the probe still gates.
- The upload step must not run only on success: `if: ${{ !cancelled() }}`, so a failing `docs patch` still posts the
  numbers.

**Not breaking the required `codecov/patch` and `codecov/project`.** Both are already scoped with `flags:` to the
package flags by the generator (`scopeAggregateStatuses`), so a new flag outside that list does not count towards them.
The generator's `codecovFlagNames()` must therefore not include `documentation`; it is added to `flag_management` and given
its own statuses as a separate step, not through the package list. Its two statuses
(`codecov/patch/documentation`, `codecov/project/documentation`) are `informational: true` until the maintainer decides
otherwise. **No ruleset or required-check change is part of this work.**

**To verify on a real upload, not by guessing** (the first PR that carries the upload; the run to look at will be named
in that PR):

1. the flag and its two statuses appear with the expected names, and `codecov/patch` / `codecov/project` (the required
   ones) are unchanged in value and name;
2. the _component_ statuses: a component is path-based and counts every flag, so the docs flag may leak into
   `codecov/patch/<component>`. If it does, set `flag_regexes` on the components to leave `documentation` out (see decision 5)
   5);
3. Codecov accepts a `DA` line that is not an executable line of the file.

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

**Rollout, by package, as each is backfilled** (the 36% backlog would otherwise publish near-empty pages). The loop is
a list in `astro.config.ts`, not 75 hand-written blocks; packages with subpath exports list each export as an entry
point, read from the `exports` map; packages with no TypeScript API (`configs/tsconfig`, `configs/browserslist-config`,
`skills`) keep their hand-written pages. TypeDoc needs each package's own tsconfig and a built dependency tree, so the
docs build task gains a `^delivery.build` dependency once more than the pilot package is generated.

The generation itself is **not** gated by the coverage number: the gate (item 2) measures the source, the reference is
a consumer of it.

## (d) The per-repo switch

The issue proposed `repoValidation: { packageRegistry, docsEnforcement: "required" | "warn" | "off" }`. Two things have
changed since:

1. **`packageRegistry` has nothing left to switch** (#1381 retired the check). Drop it.
2. **`docsEnforcement` is taken.** It is already the alias of the `docsPresence` job (a PR that adds a public package
   without a docs change), a boolean in the existing `jobs` map. Reusing the name for API-docs coverage would make one
   word mean two things, and `jobs: { docsEnforcement: false }` in this repo's config already means the first.

What the new switch has to do is three-valued, which the boolean `jobs` map cannot say:

| Value      | `docs patch` job in the workflow | Codecov `documentation` statuses | Upload |
| ---------- | -------------------------------- | -------------------------------- | ------ |
| `required` | fails the check on a miss        | not informational                | yes    |
| `warn`     | reports, always exits 0          | informational                    | yes    |
| `off`      | skipped, check reports green     | none                             | no     |

"Required" in the sense of a **branch-protection required check** is a ruleset change and stays the maintainer's
(`extraRequiredChecks` + `holocron repo setup`); the value only controls whether the check can fail and whether the
Codecov status is informational.

Shape (decision 3): a top-level key in `holocron.config.ts`, validated by the config schema and
typed in `defineConfig`:

```ts
repoValidation: {
  /** API doc-comment coverage of the code a PR changes. Default "off". */
  docsCoverage: "off" | "warn" | "required";
}
```

- **Default `off`**, so a repo that does not set it sees no change (no TypeDoc, no upload). This repo sets `"warn"`.
- It drives the generated pieces (`codecov.yml` statuses and the `docs patch` exit code), not the other way round, so
  the repo's config stays the contract.
- It sits next to, and does not replace, `jobs` (which stays the way to switch a registry sub-job off).

## Rollout

| #   | PR                                                                                           | Needs from the maintainer                     |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 0   | This spec                                                                                    | Merge                                         |
| 1   | Finish the pilot #1374 (array-utils reference, hand-written duplicate shrunk)                | Spec merged                                   |
| 2   | `docs lcov` as a file the existing probe writes with `--lcov`, uploaded as `documentation`   | Decisions 1, 2, 5                             |
| 3   | The `repoValidation.docsCoverage` switch: schema, default, tests, docs                       | Decision 3                                    |
| –   | Make `codecov/patch/documentation` a required check; backfill (issue step 5); README warning | Not part of this work; the maintainer decides |

## Decisions

The maintainer's goal, in their words: add TSDoc to the code so docs get a coverage number, enforce that coverage, use
the TSDoc as the source of truth and build the documentation site from it. The docs check may fail coverage until the
backfill catches up. Given that, each question the first draft asked is settled here with the tradeoff, so the choice can
be reversed in one place.

1. **Flag name: `documentation`.** Spelled out, not `docs`: a flag named `docs` posts `codecov/patch/docs`, which the
   `docs` component already posts. `documentation` shares no context with anything.
2. **The probe gets a `--lcov <path>` option.** CI runs the same command people run, so there is one measurement path.
   _Tradeoff:_ it adds a yargs option and a field on `ProbeContext` (a small change in the probe command), against CI
   calling `docs lcov` with no CLI change but a second entry point to keep in step. `docs lcov` stays as it is.
3. **The switch is a top-level `repoValidation.docsCoverage: "off" | "warn" | "required"`, default `off`.** This repo sets
   `"required"`: the check fails on a miss and the Codecov statuses are not informational. `required` here means the job
   can fail; it does **not** add anything to the ruleset's required checks, so a failing check does not block a merge.
   _Tradeoff:_ a top-level key is easy to find and to document and holds three states; the alternative, a string in the
   existing `jobs` map, avoids a new key but stretches a boolean map and hides the setting among task options.
4. **Generated pages are built at docs-build time and not committed.** The reference then cannot drift from the source,
   which is the "TSDoc is the source of truth" goal, and PR diffs show only the TSDoc. _Tradeoff:_ every docs build runs
   TypeDoc (about +0.4 s per small package in the pilot, more for the large ones) and needs the packages built first,
   against committed output that is fast to build but can go stale and floods diffs.
5. **Components are left as they are for now.** A component counts every flag, so the `documentation` flag may show up in
   `codecov/patch/<component>`. Those are informational, so nothing blocks; the first real upload shows whether it
   happens, and only then are `flag_regexes` added. _Tradeoff:_ excluding up front is a change to 76 components for a
   problem that may not appear.
6. **Targets:** `codecov/patch/documentation` target 100% with no threshold (the probe's rule: a touched export is
   documented), `codecov/project/documentation` target `auto` (it must not drop; it starts low and the backfill raises it).
7. **The probe step leaves the workflow after five consecutive PRs** on which both `documentation` statuses posted
   normally. Until then both run.
8. **The upload also runs on pushes to `alpha`**, so a PR has a base report to compare against.

## Out of scope (the maintainer's)

Making `codecov/patch/documentation` a branch-protection required check, the backfill (issue step 5), and the README
warning (step 6).
