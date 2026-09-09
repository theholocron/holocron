---
status: proposed
issue: theholocron/holocron#581
blocked-by: []
related:
  - theholocron/holocron#582
  - theholocron/holocron#583
  - theholocron/holocron#584
  - theholocron/holocron#585
  - theholocron/holocron#586
  - theholocron/holocron#587
  - theholocron/holocron#588
  - theholocron/holocron#589
  - theholocron/holocron#576
---

# Astromech — `@theholocron/astromech`

One **task manifest** per repo, and every surface derived from it: local
runs (`holocron run`), the CI suite run locally (`holocron ci`), the
generated GitHub Actions thin callers, the `package.json` scripts, the
super-linter linter set, the branch-protection required-checks list, and
the reusable `workflow_call` implementations pushed to `theholocron/.github`.

A self-contained library the CLI instantiates once — like
`@theholocron/logger`, not a capability plugin.

ADR: [ADR-0009](../docs/wiki/decisions/0009-astromech-task-runner-package.md).
Supersedes the `config.tasks` sketch, the raw-script sync of #566/#570, and
the hand-maintained `repo.requiredChecks` list.

## Why

"What a repo runs" lives in places that drift:

1. **CI** — reusable workflows in `theholocron/.github`, chosen per repo
   via `config.workflows`, materialised as thin callers by
   `holocron setup` / `sync-github`.
2. **`package.json` scripts** — hand-written per repo.
3. **Local dev** — you have to know turbo vs pnpm vs npm and which tool
   backs each task; there is no "run the CI suite before pushing".
4. **Required checks** — `repo.requiredChecks` in `holocron.config`,
   hand-copied from the workflow names (every `… / Conclusion` duplicated).
5. **Linters** — CI super-linter runs a large opaque set; local dev runs
   whatever the contributor remembers.

Changing a task (add `--coverage`, enable a linter) is a PR in every repo.

## The package

`packages/astromech` → `@theholocron/astromech`. A plain library — **not**
a capability plugin (no vendor / auth / transport / capability, not in the
plugin loader). The CLI depends on it and wires it in like
`@theholocron/logger`.

### Factory API

```ts
import { createAstromech } from "@theholocron/astromech";

const astromech = createAstromech({
  cwd,
  config?, // optional — the package loads it (see "Config system") if omitted
  // exec / readFile / fileExists / listDir / env — injectable for tests;
  // the package ships real defaults (spawnSync w/ stdio inherit, node:fs).
});

await astromech.run(task, { job?, passthrough?, dryRun?, required? }); // holocron run
await astromech.ci({ dryRun?, filter?, scope? });                      // holocron ci
astromech.requiredChecks();    // string[]              — branch-protection contexts
astromech.thinCallers();       // Map<filename, yaml>   — .github/workflows/*.yml
astromech.packageScripts();    // Record<string,string> — { test: "holocron run test", … }
astromech.reusableTemplates(); // Map<path, content>    — what sync-github pushes
astromech.superLinterConfig(); // { env, linterFiles }  — CI super-linter, from the manifest
astromech.plan();              // resolved task table   — holocron doctor / config show
```

The CLI's `run` / `ci` / `setup` / `sync` handlers shrink to: parse argv →
`createAstromech(...)` → call one method → set the exit code. GitHub I/O
stays in `holocron-plugin-github`.

### What moves from `packages/cli`

| From                                                                           | To (`@theholocron/astromech`)  |
| ------------------------------------------------------------------------------ | ------------------------------ |
| `src/tasks.ts`                                                                 | `registry.ts`                  |
| `src/commands/run.ts` — resolution core                                        | `run.ts`                       |
| cli `templates/workflows/*.yml` (thin-caller bases)                            | `templates/workflows/`         |
| cli `templates/workflows/*.yml` + `templates/actions/` (reusable impls)        | `templates/reusable/`          |
| `src/commands/setup-workflows/` — thin-caller gen, `normalizeWorkflowWith`     | `thin-callers.ts`              |
| `src/commands/sync-github.ts` — reusable-template batch (`buildBatch`, header) | `reusable.ts`                  |
| `repo.requiredChecks` resolution (from `@theholocron/holocron-config`)         | `required-checks.ts` (derived) |

## Config system

Astromech owns the **schema**, **validation**, and its **own
`defineConfig`** — exported from the package root and from a
zero-runtime-dep `@theholocron/astromech/config` subpath. Generic file
loading + merging is delegated to `@theholocron/datapad`
([ADR-0010](../docs/wiki/decisions/0010-datapad-config-loader.md)) — the
same loader `@theholocron/cli` uses for `holocron.config.*`.

```ts
// astromech.config.ts
import { defineConfig } from "@theholocron/astromech/config";
export default defineConfig({
  tasks: [
    "typecheck",
    { name: "test", required: true, with: { "run-coverage": true } },
    { name: "lint", linters: ["eslint", "prettier", "actionlint", "markdownlint"] },
  ],
});
```

Resolution, highest priority first:

1. `astromech.config.{ts,js,mjs,json}` (dedicated file)
2. `tasks` key of `holocron.config.{ts,js,json}`
3. built-in manifest defaults

(1) and (2) **merge** via `datapad.mergeConfig` (vitest-over-vite
layering). `@theholocron/cli`'s `defineConfig` re-exports the `TasksConfig`
type so the inline `tasks` key is typed. Does **not** replace the
`@theholocron/*-config` tool presets in `theholocron/configs`.

## The manifest — `registry.ts`

```ts
export interface LocalRunner {
  tool?: string;
  args?: string[];
  detect?: Array<{ when: RegExp; tool: string; args?: string[] }>;
  command?: string; // already a holocron subcommand (sync, sync-wiki)
}

export interface TaskDef {
  local: LocalRunner | null; // null → no local equivalent
  checkContext?: string; // CI status-check name (WORKFLOW_CHECK_CONTEXTS)
  jobs?: Record<string, { local: LocalRunner | null; checkContext: string }>;
  flags?: Record<string, string[]>; // org-default flags by tool name
  linters?: boolean; // this task is the linter aggregate (`lint`)
}
```

> **As-built (Phase 5 → 7):** the task-level `checkContext?` field stays
> unimplemented — the task check context lives in the standalone
> `WORKFLOW_CHECK_CONTEXTS` map in `thin-callers.ts` (`lint` / `test` /
> `typecheck` / `audit` → `… / Conclusion`). Phase 7 added `JobDef.checkContext`
> — **required** on every sub-job (each one is a CI job): `audit / Knip`,
> `audit / Audit the performance`, `audit / Audit the bundle size`. `holocron
run audit` and `holocron ci` print each sub-job under it.

Built-in defaults cover `test` / `typecheck` / `lint` / `build` / `audit`
(+ `knip` / `bundle-size` / `performance` jobs) / `sync` / `wiki` /
`codeql` / `deploy` / `review`, keyed identically to the workflow
templates the package also owns.

### `config.tasks` entry shape

```ts
tasks: [
  "lint", // → { ci: true, local: true }
  { name: "test", required: true, with: { "run-coverage": true } },
  { name: "audit", ci: true, local: false }, // CI-only
  { name: "lint", linters: ["eslint", "prettier"] },
];
```

| Field                                        | Effect                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ci` (default `true`)                        | thin caller written; job in `holocron ci`                                                                |
| `local` (default `true`)                     | `package.json` script `"<name>": "holocron run <name>"`; `holocron run <name>` resolves via the manifest |
| `local: false`                               | `holocron run <name>` → "CI-only task", exit 0                                                           |
| `required`                                   | check context is a required status check + in `holocron ci`'s default run                                |
| `with`                                       | per-repo override, same channel the reusable workflow reads                                              |
| `linters` (`lint` only)                      | explicit linter list; omitted → auto-detect from config files present                                    |
| `syncScripts?: boolean` (top-level)          | opt out of all `package.json` writes (default `true`)                                                    |
| `extraRequiredChecks?: string[]` (top-level) | required contexts not backed by a task (DCO, semantic PR title)                                          |

Enabling a task once — `"lint"` — gives the repo the whole synced system:
the CI thin caller, the `package.json` script, the local runner, the
required-check entry, and (for `lint`) the super-linter env.

## `holocron run <task> [job] [-- <passthrough>]`

Resolution order (in `astromech.run`):

```
key = job ? `${task}/${job}` : task

1. config.tasks entry for `task` sets `local: false`
   → "CI-only task", exit 0 (exit 1 with --required)
2. config.tasks entry carries a `with` override for this key
   → run the override command (via detected package manager)
3. turbo.json in cwd AND its pipeline/tasks defines `task`
   → turbo run <task> -- <passthrough>            (monorepo root delegates)
4. package.json scripts[task] exists AND is not `holocron run …`
   → <pm> run <task> -- <passthrough>             (explicit script wins)
5. task === "lint"
   → run each enabled linter natively (see "Lint parity")
6. TASKS[key].local resolves
   → resolve tool (detect[] if present) → `<tool> <args> <flags> <passthrough>`
7. no `job` given AND TASKS[task].jobs has entries
   → run each job in declared order
8. key is a known task with nothing to run
   → "no <key> task for this repo", exit 0 (exit 1 with --required)
9. key is neither a known task nor a script
   → "unknown task \"<key>\"", exit 1
```

**Phase 1 note (PR #590, parked):** the CLI implementation currently has
steps 3–4–6 (turbo → explicit script → registry) plus 8–9. Steps 1, 2, 5,
7 arrive with the package and later phases. Explicit-script-wins (4 before 6) is intentional — `"lint": "biome check"` gets biome.

**As-built (Phase 7):** the job branch (`key = task/job`) resolves against
`TASKS[task].jobs[job]` only — turbo / `package.json` scripts are keyed by task,
not `task/job`. A `job` argument for a task with no `jobs` is folded back into
the passthrough (`holocron run build src/`). Step 7 (no job + `jobs` present)
runs each job in declared order; a job whose tool is absent or that is
`local: null` is a skip, not a failure — `--required` on the explicit
single-job form still forces exit 1. Steps 1–2, 5 (`config.tasks`
`local: false` / `with` overrides) remain deferred.

### Package-manager / tool detection

- **PM**: `packageManager` field → definitive. Else lockfile
  (`pnpm-lock.yaml` / `bun.lockb` / `yarn.lock` / `package-lock.json`).
  Default `pnpm`.
- **Tool binary**: `node_modules/.bin/<tool>` → else PATH → else "not
  runnable here" (step 8) for a known task.
- **turbo**: `turbo.json` at repo root + task key in `pipeline`/`tasks`.

## `holocron ci`

Runs the CI suite **locally**, so an agent / `pre-push` hook / the
CLAUDE.md "definition of done" has one command for _"will CI pass?"_
(#451).

- Default scope: every `required` task. `--all` → every `ci: true` task.
  If **nothing** is marked `required`, `holocron ci` falls back to the
  `--all` set (with a note) so a repo mid-adoption still gets a signal.
- Order: the `CI_ORDER` constant in `registry.ts` — cheapest signal first
  (`typecheck → lint → test → build → audit → codeql → deploy`). Not
  `needs:` parsing (thin callers carry no `needs:` — that lives in
  `theholocron/.github`). Resolves open question #3.
- Each line prefixed with the CI check-context name (`▶ Lint / Conclusion`).
  `local: null` tasks (`codeql`, `deploy`) print
  `· no local equivalent — enforced in CI` and never fail the run. `audit`
  expands into its sub-jobs — `▶ audit / Knip`, `▶ audit / Audit the
performance`, … — unless the repo ships its own `"audit"` script.
- Exit non-zero on any failure. `--dry-run` prints the plan; `--filter
<pkg>` is a turbo passthrough.
- A `required` task whose local runner can't run is a **failure** (the
  repo claims the check but can't back it).

`holocron setup` installs a `.husky/pre-push` hook that runs `holocron ci`
— on by default for `protection: "strict"` repos, gated by the
`hooks?: boolean | { prePush?: boolean }` config field (`holocron setup
--hooks` / `--no-hooks` override; `git push --no-verify` bypasses one
push). The repo's agent skill gains a `holocron ci` step.

> **As-built (Phase 8):** CI runs the _same_ command. The reusable
> `typecheck` / `test` / `audit` workflows call a new `holocron` composite
> action (`.github/actions/holocron`) whose body is `pnpm exec holocron run
<task> [job]`; it first `pnpm build`s the workspace when
> `node_modules/@theholocron/cli/dist/cli.mjs` is missing (the holocron repo's
> `workspace:*` CLI — a no-op for consumers that install the published tarball).
> `bundle-size` → `holocron run build` (keeps `CODECOV_TOKEN` at the job level);
> `knip` / `performance` → `holocron run audit knip` / `… performance`. The
> `build-script` / `knip-script` `audit.yml` inputs are now vestigial (kept so
> callers don't error). `run.ts` step 1 forwards a task's registry org-default
> flags through turbo's `--` (`holocron run test` at a monorepo root →
> `turbo run test -- --coverage`). `holocron ci` itself is **not** used in a
> workflow — each check stays a separate job so branch protection keeps its
> distinct `… / Conclusion` contexts.

## Lint parity

One linter list drives both sides — no CI/local asymmetry.

- **Source**: `config.tasks` `{ name: "lint", linters: [...] }`, else
  auto-detected: `eslint.config.*`/`.eslintrc*` → `eslint`,
  `.prettierrc*`/`prettier.config.*` → `prettier`, `.markdownlint*` →
  `markdownlint`, `.yamllint*` → `yamllint`, `.github/workflows/*.yml` →
  `actionlint`, always → `gitleaks`.
- **Registry** maps each linter →
  `{ superLinterEnv, localBin, localArgs, detect }`.
- **CI**: `astromech.superLinterConfig()` emits the `VALIDATE_*` env (all
  others `false`) + `.github/linters/` passthrough. super-linter runs
  exactly the enabled set; it stays the CI transport (container = no
  per-linter install).
- **Local**: `holocron run lint` runs each enabled linter's `localBin`
  natively, when its binary + config are present.
- Linters with no practical local binary: flagged, optionally `npx`-run,
  still enforced in CI. Stock full super-linter locally is not required.

## Required checks

`astromech.requiredChecks(config)` returns the check-context strings for every
`{ required: true }` task — its `WORKFLOW_CHECK_CONTEXTS` entry, walked in
`CI_ORDER` and deduped — then the top-level `extraRequiredChecks`. It is
**policy-free**: `holocron setup` hard-prepends `"DCO"` for
`protection: "strict"`; astromech only knows the manifest. Consumed by:

- `holocron setup` — branch-protection required status checks (replaces
  the hand-maintained `repo.requiredChecks`).
- `holocron ci` — the default subset it runs.
- docs generation — "what a contributor / agent must pass".

`repo.requiredChecks` is removed — `required` on task entries plus the
top-level `extraRequiredChecks` replace it. Hard cutover, no alias.
`Capability.requiredChecks` in `@theholocron/holocron-config` likewise
becomes `Capability.extraRequiredChecks`, unioned onto the top-level
`ComposedPreset.extraRequiredChecks`. The check context standardized to the
aggregate `… / Conclusion` fan-in job (was the inner
`Lint / Lint entire codebase` form).

## `holocron sync` / `holocron setup` surfaces

- **Thin callers** (`astromech.thinCallers()`): one `.github/workflows/<name>.yml`
  per `ci: true` task, delegating to
  `theholocron/.github/.github/workflows/<name>.yml@main`, `secrets:
inherit`, `with:` overrides applied.
- **Package scripts** (`astromech.packageScripts()`): merge
  `"<name>": "holocron run <name>"` for each `local: true` task (never
  clobber). `syncScripts: false` skips. Replaces #566/#570.
- **super-linter config** (`astromech.superLinterConfig()`): written into the
  `lint` thin caller / `.github/linters/`.
- **Reusable templates** (`astromech.reusableTemplates()` → `Map<path, content>`,
  38 entries): the reusable `workflow_call` implementations + composite actions
  (`src/templates/reusable/`) with a "do not edit" header. `holocron sync-github`
  hands them to `runSyncGithub` (GitHub-client I/O stays in the CLI) to push to
  `theholocron/.github` — a **pure sync target**, never hand-edited. The header
  carries no timestamp so unchanged files are skipped by blob SHA.

## Monorepo + turbo

- `turbo.json` unchanged — `{ pipeline: { test: {}, build: {} } }`.
- **Root** `package.json` `"test": "holocron run test"` → step 3 → `turbo run test`.
- **Leaf** package: turbo runs the leaf's `test` script. Raw (`"vitest run"`,
  relying on `@theholocron/vitest-config`) vs thin caller — open question.
- **Single-package repo**: no `turbo.json` → step 6.

## Non-goals

- Shipping capability plugins with the global CLI (#576).
- A generic script runner — the manifest tasks + existing `package.json`
  scripts only.
- Replacing turbo — astromech is the entry point; turbo stays the executor.
- Making astromech a capability plugin — it has no vendor.
- Replacing `@theholocron/*-config` tool presets.

## Open questions

1. **Leaf-package scripts in a monorepo** — thin callers everywhere, or
   leaves stay raw with shared configs carrying the flags? Leaning: raw
   leaves.
2. **Linters with no local binary** — RESOLVED (Phase 4): `holocron run lint`
   runs whatever resolves in `node_modules/.bin` or on `PATH`; anything missing
   is flagged with an install hint (`brew install …`) and left to CI. No `npx`,
   no container. Install the binaries to run the full set locally.
3. **Job dependency order for `holocron ci`** — RESOLVED (Phase 5): a
   declared `CI_ORDER` constant in `registry.ts` (cheapest signal first).
   Not `needs:` parsing — thin callers carry no `needs:`.
4. **`config show` repo-awareness** (#576) — confirm before `astromech.plan()`
   depends on it.
5. **`astromech.config.ts` vs `holocron-tasks.config.ts`** for the
   dedicated file — leaning `astromech.config.ts` (mirrors
   `vitest.config.ts`).
6. **Single package + `/config` subpath vs a later split** to
   `@theholocron/astromech-config` — start single, split is non-breaking.
   (The generic loader is already its own package, `@theholocron/datapad`,
   ADR-0010 — this question is only about the astromech schema layer.)

## Phases

Tracking epic: **#581**.

| #    | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Issue |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1 ✅ | `tasks.ts` + `holocron run <task>` in `packages/cli` (test / typecheck / lint / build), resolution 3–4–6 + 8–9, PM + turbo detection, tests, docs.                                                                                                                                                                                                                                                                                                                      | #590  |
| 2a   | Extract `@theholocron/datapad` (ADR-0010) — generic config loader; `@theholocron/cli` migrates `holocron.config.*` loading to it.                                                                                                                                                                                                                                                                                                                                       | #582  |
| 2b   | Scaffold `@theholocron/astromech` + `/config`; move `tasks.ts` → `registry.ts` + `commands/run.ts` → `run.ts`; `TasksConfig` schema + `defineConfig` + `loadTasksConfig` on top of datapad; `createAstromech({ cwd })` → `{ run }`; CLI's `run` command delegates.                                                                                                                                                                                                      | #583  |
| 2c   | `config.workflows` → `config.tasks` hard rename — `HolocronConfig` schema, `compose.ts`, `holocron.config.ts`, and the `@theholocron/holocron-config` preset (companion PR in `theholocron/configs`). Wire `loadTasksConfig` into the resolver (`local: false`, `with`).                                                                                                                                                                                                | #583  |
| 3 ✅ | Move `setup-workflows/` + templates (#597); `astromech.thinCallers()` / `astromech.packageScripts()` (#598); cli consumes astromech (#599); `holocron sync` `scripts` step + `syncScripts` / `holocronScript` config, supersede #566 / #570. (Deferred `sync`/`setup` → `thinCallers()` consumption folded into Phase 6.)                                                                                                                                               | #584  |
| 4 ✅ | Lint parity: `LINTERS` registry + auto-detect + `resolveLinters` / `superLinterConfig()` (PR 4.1); reusable `lint.yml` `super-linter-env` input (4.2); `thinCallers()` / sync / setup emit it (4.3); `holocron run lint` runs the set natively (4.4).                                                                                                                                                                                                                   | #585  |
| 5 ✅ | `astromech.requiredChecks()` + `CI_ORDER` + `… / Conclusion` contexts (PR 5.1); `holocron ci` + `astromech.ci()` + `--filter` (5.2); branch-protection cutover — `repo.requiredChecks` removed, `Capability.extraRequiredChecks` (5.3); `hooks` field + `.husky/pre-push` template + `setup --hooks` (5.4); CLAUDE.md "definition of done" + spec + ADR-0009/0010 → Accepted (5.5).                                                                                     | #586  |
| 6 ✅ | `astromech.reusableTemplates()` + move the 18 reusable workflows + 4 actions to `src/templates/reusable/`; `sync-github` shrinks to a `reusableTemplates()` consumer, dead `parseTasksFromTs`/`parseOrgContextFromTs` + the `# Synced:` timestamp dropped (PR 6.1); `sync` / `setup` consume `astromech.thinCallers()` — the deferred #584 item (PR 6.2); spec + `AGENTS.md` "pure sync target" (PR 6.3). Companion notes in `theholocron/.github` + `.github-private`. | #587  |
| 7 ✅ | `holocron run <task> <job>` + `audit` sub-jobs (`bundle-size` / `knip` / `performance`); `JobDef.checkContext`; `holocron run audit` runs every job in order; `holocron ci` expands `audit` into per-job check-context lines; job-position arg folds into passthrough for job-less tasks.                                                                                                                                                                               | #588  |
| 8 ✅ | The reusable `typecheck` / `test` / `audit` workflows run their core step through a new `holocron` composite action (`holocron run <task> [job]`); `bundle-size` → `holocron run build`, `knip` → `holocron run audit knip`, `performance` → `holocron run audit performance`. `run.ts` turbo delegation forwards the registry's org-default flags (`test` → `--coverage`). `lint.yml` stays a super-linter Action (Phase-4 parity).                                    | #589  |

## Test plan

- `registry.test.ts` — manifest shape, `detect[]` by filename, linter map.
- `config.test.ts` — file resolution + merge precedence, `defineConfig`
  passthrough, `tasks` key + `astromech.config.*` layering.
- `run.test.ts` — resolution matrix (all 9 steps), PM detection, flag
  injection, `-- <passthrough>`. Injectable `exec` + fs, as in PR #590.
- `ci.test.ts` — scope (`required` vs `--all`), order, check-context
  prefixes, `local: null` skips, non-zero exit, `--dry-run`, `--filter`.
- `lint.test.ts` — auto-detect from fixture config files; `superLinterConfig`
  env matches the enabled set; local run invokes each `localBin`.
- `required-checks.test.ts` — derived list + `extraRequiredChecks`.
- `thin-callers.test.ts` / `package-scripts.test.ts` — one file per
  `ci: true` / `local: true`, `with:` merged, merge-not-clobber.
- CLI integration — handlers delegate to `createAstromech`; exit codes.
- Docs: `commands/run.mdx`, `commands/ci.mdx`, `config.mdx` (`tasks`
  entry), `packages/cli/README.md`, `packages/astromech/README.md`.
