---
status: draft
issue: theholocron/holocron#675
blocked-by: []
related:
  - theholocron/holocron#672
  - theholocron/holocron#676
---

# Vocabulary + registry rename — astromech `TASKS`

Workstream spec under the [Holocron Platform epic](https://github.com/theholocron/holocron/issues/672)
(`.notes/tech-holocron-platform.spec.md`). Covers D3 and the "Vocabulary
mapping" section of that spec in full detail.

## Problem

`astromech`'s `TASKS` registry (`packages/astromech/src/astromech.ts`) names
things by **tool** (`test`, `lint`, `typecheck`, `build`, `release`), not by
**intent**. A repo's `holocron.config.ts` says `tasks: ["test", "lint"]` —
which tells you nothing about _why_ those tasks exist without reading the
registry. The ChatGPT-seeded design behind the epic wants repos to declare
intent directly.

## Decision (D3, carried from the epic spec)

Rename astromech's existing task model **in place** — one system, not a
parallel intent layer that has to stay in sync with it. **No back-compat
shim.** Exactly one consumer exists (every repo in this org, all migrated the
same way via `holocron setup` re-runs — see the migration-pass workstream,
#680) and nothing external depends on the current names staying stable. A
straight rename is faster to build than aliasing old names alongside new
ones.

## Vocabulary mapping (proposed — refine during implementation)

The target vocabulary is an intent-facing rename layer over the existing
`TASKS` registry, not a new orthogonal system. Several intent names
decompose a single existing task (`lint` currently bundles eslint + prettier

- yamllint + gitleaks + editorconfig + commitlint + actionlint per
  `src/linters.ts`) — whether that decomposition actually happens, or `lint`
  stays one umbrella CI job with intent-named _linters_ underneath it, is an
  open implementation question, not something forced here.

| Repo-facing intent (proposed)            | Resolves to (today)                                                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verification.unitTests`                 | `test` task (vitest)                                                                                                                                |
| `verification.coverage`                  | `test` task's `--coverage` flag                                                                                                                     |
| `verification.typeSafety`                | `typecheck` task (tsc)                                                                                                                              |
| `sourceQuality.staticAnalysis`           | `lint` task → eslint linter                                                                                                                         |
| `sourceQuality.formatting`               | `lint` task → prettier linter                                                                                                                       |
| `sourceQuality.structuredDataValidation` | `lint` task → yamllint linter                                                                                                                       |
| `security.secretDetection`               | `lint` task → gitleaks linter                                                                                                                       |
| `security.dependencyReview`              | `Source.enableVulnerabilityAlerts()` / `enableDependencyGraph()` (already exists, different code path — a capability-model method, not a task)      |
| `delivery.build`                         | `build` task                                                                                                                                        |
| `delivery.publish`                       | the `release` task entry (`{ name: "release", with: {...} }`) already used per-repo today                                                           |
| — (no existing task)                     | `dependencyUpdates` → Renovate/Dependabot config, currently repo-owned `.github/dependabot.yml`; centralizing this is in scope but not yet designed |

Tool names (`eslint`, `vitest`, `tsdown`, …) stay exactly where they are
today: internal to `astromech`'s registry and `theholocron/configs`. They
never need to appear in a repo's `holocron.config.ts` for the intents this
table covers.

## Scope

- Rename the `TASKS` registry keys + every generator function that reads the
  `tasks` array: `holocron run` / `holocron ci`, thin-caller generation,
  `package.json` script generation, `requiredChecks()`, `codecovConfig()`.
- Update `holocron.config.ts` schema (`packages/cli/src/config/config.ts`)
  and every repo's config via `holocron setup` re-runs (folds into #680, not
  duplicated here).
- D10 constraint applies: nothing in the rename hardcodes `"theholocron"` —
  already true today (`orgContext`), must stay true after the rename.

## Out of scope

- Config resolution (Bucket A `--config` passthrough) — separate workstream,
  #676, even though both touch the same registry entries.
- The `lint` decomposition question is explicitly left open (see below), not
  resolved by this spec.

## Open questions

- Final shape of the `lint` task decomposition (one umbrella job vs.
  separately-gated `staticAnalysis`/`formatting`/`structuredDataValidation`/
  `secretDetection` intents) — resolve during implementation.
- Whether `dependencyUpdates` gets a real task entry in this pass or stays a
  documented gap until Dependabot centralization is designed.

## PR-stack

TBD — broken into leaf issues once the registry-rename approach (decompose
`lint` vs. not) is settled.
