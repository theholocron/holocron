# ADR-0009 — Astromech: the task-runner + CI-parity package

## Status

Proposed

## Context

Three things describe "what a repo runs", and they drift apart:

1. **CI** — reusable workflows in `theholocron/.github`, selected per repo
   through `config.workflows`, materialised as thin callers in
   `.github/workflows/*.yml` by `holocron setup` / `holocron sync-github`.
2. **`package.json` scripts** — hand-written per repo (`pnpm test` →
   `turbo run test` → `vitest run --coverage`).
3. **Local dev** — the contributor (or an agent) has to know turbo vs pnpm
   vs npm, and which tool backs each task, and has no way to run "the CI
   suite" before pushing.

`holocron run <task>` (#449, Phase 1 in #590) unified (3) behind a
CLI-owned registry, `packages/cli/src/tasks.ts`, keyed identically to the
workflow templates in `packages/cli/src/commands/setup-workflows/`. That
registry, the templates, the thin-caller generator, the `sync-github` push
logic, and the branch-protection **required-checks** list
(`repo.requiredChecks` in `holocron.config`) are one cohesive concern
spread across `packages/cli` and the `@theholocron/holocron-config` preset,
with no boundary around it and real duplication (every workflow's
`… / Conclusion` check is hand-copied into `requiredChecks`).

The machinery also has consumers beyond the CLI's own commands:
`theholocron/.github` needs the reusable-workflow templates, and every
secondary repo needs the thin callers, the script list, and the
required-checks list.

Tracked in #581. Spec: `.notes/tech-astromech-task-runner.spec.md`.

## Decision

### Extract `@theholocron/astromech`

A new workspace library at `packages/astromech`, published as
`@theholocron/astromech`. An astromech droid handles a starfighter's
maintenance, diagnostics and system wiring while the pilot flies — this
package does the same for a repo. It owns one **task manifest** and every
surface derived from it.

| Concern                                              | Moves from                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| Task registry (`TASKS`, defaults)                    | `packages/cli/src/tasks.ts`                                         |
| Local task resolution (turbo / script / tool / skip) | `packages/cli/src/commands/run.ts`                                  |
| Reusable-workflow templates (`*.yml`)                | `packages/cli/src/templates/workflows/`                             |
| Thin-caller generation + `with:` normalisation       | `packages/cli/src/commands/setup-workflows/`                        |
| Reusable-template push mechanics                     | `packages/cli/src/commands/sync-github.ts`                          |
| Required-checks resolution                           | `repo.requiredChecks` (hand-maintained) → derived from the manifest |
| Config schema + `defineConfig` (loading → datapad)   | new — see below                                                     |

Registry and templates end up in the same package, keyed the same way.
Adding a task is a template file plus a manifest entry, both here.

### Self-contained, like `@theholocron/logger` — not a capability plugin

`@theholocron/holocron-plugin-*` packages are vendor adapters: `auth.ts`,
a REST/shell transport, capability interfaces the `PluginLoader` wires up
from provider tuples. Astromech has none of that — no vendor, no auth, no
transport, no capability. It is core orchestration every repo uses
regardless of providers.

So it is a plain library the CLI **depends on and instantiates once**,
borrowing the plugin ergonomic without the plugin plumbing:

```ts
import { createAstromech } from "@theholocron/astromech";

const astro = createAstromech({
  cwd,
  // config is loaded by the package (see "Config system"); or pass one in.
  // exec / readFile / fileExists / listDir / env — injectable for tests;
  // the package ships real defaults (spawnSync w/ stdio inherit, node:fs).
});

await astro.run(task, { job, passthrough, dryRun, required }); // holocron run
await astro.ci({ dryRun, filter, scope }); // holocron ci
astro.requiredChecks(); // string[]  — branch-protection check contexts
astro.thinCallers(); // Map<filename, yaml>   — .github/workflows/*.yml
astro.packageScripts(); // Record<string,string> — { test: "holocron run test", … }
astro.reusableTemplates(); // Map<path, content>  — what sync-github pushes
astro.superLinterConfig(); // { env, linterFiles } — CI super-linter, from the manifest
astro.plan(); // resolved task table — holocron doctor / config show
```

The CLI's `run` / `ci` / `setup` / `sync` handlers shrink to: parse argv →
`createAstromech(...)` → call one method → set the exit code. GitHub I/O
stays in `holocron-plugin-github` — `astro.reusableTemplates()` and
`astro.requiredChecks()` return _what_ to push / enforce; the CLI hands
them to the `source` capability.

### Config system — vite/vitest-style

Astromech owns the config **schema**, **validation**, and its **own
`defineConfig`** — exported from the package root and from a
zero-runtime-dep `@theholocron/astromech/config` subpath (imported by
config files and by `@theholocron/cli` for typing, without pulling the
runner).

The generic file **loading and merging** is delegated to
`@theholocron/datapad` (ADR-0010) — the same loader `@theholocron/cli`
uses for `holocron.config.*`. Resolution, highest priority first:

1. `astromech.config.{ts,js,mjs,cjs,json}` in the repo root (dedicated file)
2. the `tasks` key of `holocron.config.{ts,js,json}`
3. built-in manifest defaults

(1) and (2) **merge** via `datapad.mergeConfig` — like `vitest.config.ts`
layering over `vite.config.ts`. The `holocron.config.ts` `defineConfig`
(from `@theholocron/cli`) re-exports astromech's `TasksConfig` type so the
`tasks` key is fully typed inline.

This does **not** replace the `@theholocron/*-config` presets in
`theholocron/configs` (those are third-party tool configs); it is the
holocron-native task/CI manifest.

### `config.workflows` → `config.tasks`

The manifest is the one list. `config.workflows` is renamed `config.tasks`
(the `@theholocron/holocron-config` preset changes with it) — a hard
rename, no alias (the org is the only consumer). Entry shape grows:

```ts
tasks: [
  "lint", // shorthand → { ci: true, local: true }
  { name: "test", required: true, with: { "run-coverage": true } },
  { name: "audit", ci: true, local: false }, // CI-only
];
```

| Field                            | Effect                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ci` (default `true`)            | thin caller written; job runs in `holocron ci`                                                                               |
| `local` (default `true`)         | `package.json` `"<name>": "holocron run <name>"`; `holocron run <name>` resolves via the manifest                            |
| `local: false`                   | `holocron run <name>` prints "CI-only task", exit 0                                                                          |
| `required` (default from preset) | task's check context is a required status check (`holocron setup` branch protection) and part of `holocron ci`'s default run |
| `with`                           | per-repo override on the same channel the reusable workflow reads                                                            |

### `holocron ci` — run the required suite locally

`holocron ci` runs every `required` task (`--all` for every `ci: true`
task) natively, in dependency order, and exits non-zero on any failure.
This is the command an agent skill, a git `pre-push` hook, and the
CLAUDE.md "definition of done" point to for _"will CI pass?"_ — closing
#451. `holocron setup` can install the `pre-push` hook; the repo's agent
skill gains a `holocron ci` step.

### `lint` — parity through one linter manifest (not an asymmetry)

`config.tasks` (or auto-detection from config files present) carries the
**explicit linter list**: `["eslint", "prettier", "actionlint",
"markdownlint", "yamllint", "gitleaks", …]`. From that one list:

- **CI**: `astro.superLinterConfig()` generates super-linter's
  `VALIDATE_*` env and `.github/linters/` passthrough so the container
  runs **exactly that set** — super-linter stays the CI transport (no
  per-linter install in CI) but is no longer "everything".
- **Local**: `holocron run lint` runs the **same linters** natively
  (`eslint`, `prettier --check`, the `actionlint` binary, …), each when
  its binary/config is present.

What passes locally passes super-linter. Linters with no practical local
binary are flagged and optionally run via `npx`; still enforced in CI.
Running the full stock super-linter locally is not required (and not the
default).

### `theholocron/.github` is a pure sync target

Reusable workflow implementations are generated from
`@theholocron/astromech` templates and pushed by `sync-github`. `.github`
never hand-edits them. This ADR codifies the direction the sync machinery
already points.

## Consequences

- `packages/cli` loses ~5 source areas and gains a dependency; its command
  handlers become thin dispatchers.
- One new published package enters the lockstep release
  (`scripts/bump-versions.mjs`, Trusted Publisher, `codecov.yml`
  component, docs-theme registry).
- `config.workflows` → `config.tasks` (hard rename); `repo.requiredChecks`
  is removed — replaced by `required` on task entries plus a top-level
  `extraRequiredChecks` for non-task contexts (DCO, semantic PR title).
  The `@theholocron/holocron-config` preset migrates in step.
- `theholocron/.github` and any repo can import the template / thin-caller
  / required-checks generators directly instead of shelling `holocron`.
- The `holocron.config` string and `{ name, with }` entry forms carry over
  unchanged under `tasks`.
- Migration is phased (epic #581): Phase 1 `holocron run` is written
  (PR #590, parked); each later phase moves one area and keeps CI green.
- Not a plugin: absent from `holocron plugin create`, the plugin loader,
  and the capability list. Wired in `cli.ts` like `@theholocron/logger`.

## References

- Issues: #581 (extraction), #449 (`holocron run`), #451 (`holocron ci`),
  #566 (sync-managed scripts), #590 (Phase 1 code, parked)
- ADR-0007 — the `@theholocron/logger` extraction is the precedent for a
  self-contained non-plugin library the CLI instantiates
- ADR-0010 — `@theholocron/datapad`, the config loader astromech's config
  system sits on
- vite / vitest `defineConfig` layering — the config-system model
- Spec: `.notes/tech-astromech-task-runner.spec.md`
