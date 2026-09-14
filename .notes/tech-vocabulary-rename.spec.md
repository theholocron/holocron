---
status: draft
issue: theholocron/holocron#675
blocked-by: []
related:
  - theholocron/holocron#672
  - theholocron/holocron#676
  - theholocron/holocron#678
  - theholocron/holocron#679
---

# Vocabulary + registry rename — astromech `TASKS`

Workstream spec under the [Holocron Platform epic](https://github.com/theholocron/holocron/issues/672)
(`.notes/tech-holocron-platform.spec.md`). Covers D3, D11, D12, D13 and the
"Vocabulary mapping" section of that spec in full detail.

## Problem

`astromech`'s `TASKS` registry (`packages/astromech/src/astromech.ts`) names
things by **tool** (`test`, `lint`, `typecheck`, `build`, `release`), not by
**intent**. A repo's `holocron.config.ts` says `tasks: ["test", "lint"]` —
which tells you nothing about _why_ those tasks exist without reading the
registry. The ChatGPT-seeded design behind the epic wants repos to declare
intent directly.

## Decisions carried from the epic spec

- **D3** — rename in place, no back-compat shim. Exactly one consumer (every
  repo in this org, migrated the same way via `holocron setup` re-runs — see
  #680) and nothing external depends on the current names staying stable.
- **D11** — one canonical vocabulary table is the single source of truth.
  Every other artifact (`KNOWN_TASKS`, `KNOWN_WORKFLOWS`, `WORKFLOW_CHECK_CONTEXTS`,
  `CI_ORDER`, package-script names) is derived from the registry module, never
  hand-duplicated. The future GitHub App (#679) imports the same table rather
  than reimplementing its own copy for schema validation.
- **D12** — drop super-linter for the decomposed lint-derived tasks; each
  runs its one tool natively in CI, the same command `holocron run` runs
  locally.
- **D13** — `@theholocron/holocron-config`'s `nodeDocs()` preset is a
  convenience default, not a required declaration; this workstream doesn't
  block on a synchronized `theholocron/configs` publish.

## Final vocabulary mapping (locked)

Full decomposition — `lint` (which bundled 9 linters, not 4) and `audit`
(which bundled 3 jobs) both split into separate top-level tasks, one per
distinct intent, following the same reasoning throughout: a bundle hiding
several unrelated intents behind one name loses exactly the information this
epic exists to surface.

| New task                                 | Was                            | Tool(s)                                        | Notes                                                                                                                               |
| ---------------------------------------- | ------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `verification.unitTests`                 | `test`                         | vitest                                         | carries `--coverage` org flag                                                                                                       |
| `verification.typeSafety`                | `typecheck`                    | tsc                                            |                                                                                                                                     |
| `verification.performance`               | `audit` → `performance` job    | lighthouse (lhci)                              | detect-gated (needs a lighthouse config)                                                                                            |
| `sourceQuality.staticAnalysis`           | `lint` (partial)               | eslint, actionlint, git-merge-conflict-markers | linter group                                                                                                                        |
| `sourceQuality.formatting`               | `lint` (partial)               | prettier, editorconfig, markdownlint           | linter group                                                                                                                        |
| `sourceQuality.structuredDataValidation` | `lint` (partial)               | yamllint                                       |                                                                                                                                     |
| `sourceQuality.deadCodeAnalysis`         | `audit` → `knip` job           | knip                                           |                                                                                                                                     |
| `security.secretDetection`               | `lint` (partial)               | gitleaks                                       |                                                                                                                                     |
| `security.codeScanning`                  | `codeql`                       | CodeQL                                         | GitHub's own term for what it does                                                                                                  |
| `security.dependencyReview`              | —                              | —                                              | already exists as a capability-model method (`Source.enableVulnerabilityAlerts()`/`enableDependencyGraph()`), not a task; unchanged |
| `delivery.build`                         | `build`                        | tsdown/vite/rollup/tsc (detect)                |                                                                                                                                     |
| `delivery.publish`                       | `release`                      | semantic-release                               | carries `preview` (npm dist-tags)                                                                                                   |
| `delivery.deploy`                        | `deploy`                       | Cloudflare Pages/Vercel                        | carries `preview`                                                                                                                   |
| `delivery.bundleSize`                    | `audit` → `bundle-size` job    | —                                              | CI-only, no local equivalent, same as today                                                                                         |
| `platform.repoSync`                      | `sync`                         | `holocron sync`                                |                                                                                                                                     |
| `platform.commitStandards`               | `lint` (partial)               | commitlint                                     | CI-only, no local equivalent, same as today                                                                                         |
| `knowledge.wiki`                         | `wiki`                         | Fern                                           | publish, not sync; carries `preview`                                                                                                |
| `knowledge.docs`                         | _(new — was a fixed workflow)_ | Astro build                                    | the docs site itself; carries `preview`                                                                                             |
| `knowledge.components`                   | _(new — was a fixed workflow)_ | Storybook build                                | "Storybook" is the tool, not the intent — this is a browsable component catalog; carries `preview`                                  |
| — (no existing task)                     | `dependencyUpdates`            | Renovate/Dependabot                            | not designed yet, tracked as an open question below                                                                                 |

`preview` is a cross-cutting **feature**, not a separate task or namespace —
npm has staging dist-tags, Cloudflare/Vercel already do per-PR preview
deploys, Fern's `wiki.yml` already takes a `preview: true` input. None of
these earn their own verb; it's one capability any publish/deploy-shaped
task can carry.

Tool names (`eslint`, `vitest`, `tsdown`, …) stay internal to `astromech`'s
registry and `theholocron/configs`. They never need to appear in a repo's
`holocron.config.ts`.

## Decomposition mechanics

No new abstraction needed — the existing `jobs` shape (already used by
`audit` today) generalizes cleanly:

- Single-tool tasks (`verification.unitTests`, `security.codeScanning`, …)
  keep the existing `local: { tool, args }` / `detect` / `command` shape,
  unchanged.
- Linter-group tasks (`sourceQuality.staticAnalysis`, `sourceQuality.formatting`,
  `sourceQuality.structuredDataValidation`, `security.secretDetection`,
  `platform.commitStandards`) get a new `TaskDef.linterGroup?: string[]`
  field — names into `linters.ts`'s existing `LINTERS` table. `run.ts`
  resolves it via the existing `resolveLinters({ explicit, rootFiles })`
  (already supports a restricted explicit list + the config-file detection
  gate), replacing the old `task === "lint"` special case with a normal
  step in the resolution ladder — checked _after_ turbo/`package.json`
  script resolution, not before, so a decomposed task is a normal
  turbo-delegatable task like any other (today's `lint` aggregate skipped
  that check entirely; no longer necessary once D9 makes `turbo.json`
  universal).
- The old `config.tasks[].linters` per-repo override list goes away — a
  repo's choice of which linters run is now just which tasks it includes in
  `tasks: [...]`, directly, consistent with how every other task works.

## Scope

- Rewrite `registry.ts` (`TASKS`, `KNOWN_TASKS`, `CI_ORDER`) against the
  locked table above.
- Generalize `run.ts`: remove the `task === "lint"` special case and
  `runLintAggregate`; add the `linterGroup` resolution step.
- Update `thin-callers.ts` (`KNOWN_WORKFLOWS`, `WORKFLOW_CHECK_CONTEXTS`) and
  author the workflow templates for the 5 decomposed lint-derived tasks
  (native tool steps per D12, no super-linter) plus the 2 new `knowledge.*`
  tasks (extracted from the fixed `Preview` workflow's `type: docs`/`type:
storybook` modes).
- Update `required-checks.ts` and `ci.ts` for the new `CI_ORDER`/context
  strings.
- Update `config/schema.ts`: drop `TaskEntry.linters` (superseded by direct
  task inclusion).
- This repo's own `holocron.config.ts`/`astromech.config.ts` migrate in the
  same PR (dogfooding — this repo's own CI can't stay on old names once
  `astromech` no longer knows them). Per D13, this repo's config stops
  spreading the (not-yet-updated) `nodeDocs()` preset for the renamed tasks
  until `theholocron/configs` catches up in its own follow-up.

## Out of scope (tracked elsewhere)

- Config resolution (Bucket A `--config` passthrough) — #676, even though
  both touch the same registry entries.
- `theholocron/configs`' `nodeDocs()` preset update — separate follow-up per
  D13, not blocking this workstream.
- The other ~20 repos' `holocron.config.ts` migration — #680.
- `astromech.requiredChecks()`'s interaction with the ruleset `workflows`
  rule investigation (#678) — flagged there: decomposing `audit`'s jobs
  removes its own synthetic-`Conclusion`-job need independent of that
  investigation's outcome.

## Open questions

- Whether `dependencyUpdates` gets a real task entry in this pass or stays a
  documented gap until Dependabot centralization is designed.

## PR-stack

- [ ] `registry.ts` + `run.ts` + `config/schema.ts` rewrite, package-internal
      tests green
- [ ] `thin-callers.ts` / `required-checks.ts` / `ci.ts` + new workflow
      templates (native tool steps, no super-linter; 2 new `knowledge.*`
      templates)
- [ ] This repo's own `holocron.config.ts`/`astromech.config.ts` migration
- [ ] `packages/astromech/README.md` + docs-site intent→technology table
      (requested directly — see epic spec's docs requirement)
