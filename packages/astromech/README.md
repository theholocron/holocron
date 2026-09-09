# `@theholocron/astromech`

The Holocron task runner. One **task manifest** per repo, and every
derived surface comes from it: `holocron run` (local), `holocron ci` (the
CI suite run locally), the generated GitHub Actions workflows, the
`package.json` scripts, the linter set, and the branch-protection
required-checks list.

> An astromech droid runs a starfighter's maintenance, diagnostics and
> system wiring while the pilot flies. This does that for a repo.

A plain library — **not** a capability plugin. `@theholocron/cli` depends
on it and instantiates it once.

## Installation

```sh
pnpm add @theholocron/astromech
```

## Usage

```ts
import { createAstromech } from "@theholocron/astromech";

const astromech = createAstromech({ cwd });

const report = astromech.run("test", { passthrough: ["--watch"] });
// → { status: "ok" | "fail" | "skip" | "dry-run" | "unknown", command?, message? }
```

### `holocron run <task>` resolution

`holocron run test` runs your tests — you don't tell it turbo vs pnpm vs
npm, or which runner:

```
1. turbo.json defines the task            → turbo run <task>
2. package.json has a <task> script       → <detected pm> run <task>
   (a "holocron run …" thin caller is skipped — no recursion)
3. the registry has a local runner        → <tool> <args> <org-flags>   (e.g. --coverage)
4. known task, nothing to run             → "no <task> task", exit 0  (exit 1 with --required)
5. unknown task                           → error, exit 1
```

The registry (`TASKS`) covers `test` / `typecheck` / `lint` / `build` /
`sync` / `wiki`; `codeql` / `deploy` have no local equivalent. Adding a
task here gives every repo that task.

## Config — `@theholocron/astromech/config`

The config surface lives in a zero-runtime-dep subpath so
`astromech.config.ts` and `@theholocron/cli` import it without pulling
the runner.

```ts
// astromech.config.ts
import { defineConfig } from "@theholocron/astromech/config";

export default defineConfig({
  tasks: [
    "typecheck",
    { name: "test", required: true, with: { "run-coverage": true } },
    { name: "audit", ci: true, local: false }, // CI-only
  ],
});
```

`loadTasksConfig(cwd)` resolves the manifest: the `tasks` key of
`holocron.config.*` (a bare item array), then a dedicated
`astromech.config.*` merged on top (dedicated wins; arrays concatenate).

| `TaskEntry` field        | Effect                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `ci` (default `true`)    | emit the CI workflow; include in `holocron ci`              |
| `local` (default `true`) | write the `package.json` script; `holocron run` resolves it |
| `local: false`           | `holocron run <name>` → "CI-only task", exit 0              |
| `required`               | the task's check context is a required status check         |
| `with`                   | per-repo overrides on the reusable-workflow channel         |
| `linters` (`lint` only)  | explicit linter list; omitted → auto-detect                 |

Top-level keys: `syncScripts: false` disables the `package.json` script
writes entirely; `holocronScript` sets the command the synced `"holocron"`
script runs (default `"holocron"`).

### Generated surfaces

```ts
const astromech = createAstromech({ cwd, config, orgContext: { org, domain } });

astromech.thinCallers(); // Map<"<name>.yml", yaml>  — one per templated, ci-enabled task
astromech.packageScripts(); // { holocron: "holocron", lint: "holocron run lint", … }
```

`thinCallers()` returns the raw `.github/workflows/*.yml` content (no
generated-by header — the caller prefixes its own). `deploy` with
`preview:` shorthand produces the combined push-to-Pages / PR-to-preview
workflow. `packageScripts()` emits the `holocron` entry
(`holocronScript ?? "holocron"`) plus one `"<task>": "holocron run <task>"`
per runnable task; it skips `local: false` entries and tasks with no local
runner (`codeql`, `deploy`), and returns `{}` when `syncScripts: false` or
there is no config.

`holocron run` itself does not read the config yet — that (and
`holocron ci`) come in later phases (epic #581).

## Lint parity

One linter list drives both CI and local — no asymmetry. Source: the
`lint` task's `linters` array, or auto-detection from the config files
present. The `linter name → super-linter VALIDATE_* keys` mapping lives in
one place, `src/linters.ts`.

| linter                       | `VALIDATE_*`                              | always-on                           | local binary                             |
| ---------------------------- | ----------------------------------------- | ----------------------------------- | ---------------------------------------- |
| `eslint`                     | `JAVASCRIPT_ES`, `TYPESCRIPT_ES`          | on `eslint.config.*` / `.eslintrc*` | `eslint .`                               |
| `prettier`                   | `*_PRETTIER` (JS/JSX/TS/TSX/MD) + `FIX_*` | yes                                 | `prettier --check .`                     |
| `yamllint`                   | `YAML`                                    | yes                                 | `yamllint .` (usually CI-only)           |
| `actionlint`                 | `GITHUB_ACTIONS`                          | yes                                 | `actionlint` (usually CI-only)           |
| `gitleaks`                   | `GITLEAKS`                                | yes                                 | `gitleaks dir` (usually CI-only)         |
| `editorconfig`               | `EDITORCONFIG`                            | yes                                 | `editorconfig-checker` (usually CI-only) |
| `commitlint`                 | `GIT_COMMITLINT`                          | yes                                 | `commitlint --last`                      |
| `git-merge-conflict-markers` | `GIT_MERGE_CONFLICT_MARKERS`              | yes                                 | — (CI only)                              |
| `markdownlint`               | `MARKDOWN`                                | on `.markdownlint*`                 | `markdownlint-cli2`                      |

```ts
import { superLinterConfig, resolveLinters } from "@theholocron/astromech";

superLinterConfig({ explicit: ["eslint", "prettier"], rootFiles: fs.readdirSync(cwd) });
// → { env: { VALIDATE_JAVASCRIPT_ES: "true", … }, linters: ["eslint","prettier"], configInputs: { … } }
```

`superLinterConfig().env` is the exact `VALIDATE_*`/`FIX_*` map the CI
`lint` job needs — the CLI serializes it as the `super-linter-env` input on
each repo's generated `lint` thin caller. Setting any `VALIDATE_*` puts
super-linter in allow-list mode, so emitting only the enabled keys makes it
run exactly the resolved set.

`holocron run lint` (later phase) runs the same set natively: `turbo run
lint` for the eslint portion (cached), then each other linter whose binary
resolves; linters with a binary that is not on `PATH` are flagged with an
install hint; the rest print "CI only".

## Development

| Script               | Description             |
| -------------------- | ----------------------- |
| `pnpm build`         | Bundle with tsdown      |
| `pnpm test`          | Run the vitest suite    |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm typecheck`     | `tsc --noEmit`          |
| `pnpm lint`          | ESLint                  |

## Releases

Automated via semantic-release. See [CHANGELOG.md](../../CHANGELOG.md).

## Documentation

<https://theholocron.github.io/holocron/>
