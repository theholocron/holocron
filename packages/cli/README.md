<!-- editorconfig-checker-disable-file -->

# `@theholocron/cli`

The Holocron CLI — a pluggable, capability-based orchestrator for
spinning up and operating software projects.

## Install

<!-- prettier-ignore -->
```bash
pnpm add -g @theholocron/cli@alpha
holocron --help

```

## Config file

Holocron reads `holocron.config.{json,js,ts}` from the project root
(priority: json → js → ts).

**JSON** (simplest):

<!-- prettier-ignore -->
```jsonc
// holocron.config.json
{
  "name": "my-app",
  "providers": {
    "vault": ["1password", { "vault": "my-app" }],
    "source": "github",
  },
}

```

**JS/TS** — use `defineConfig` for autocomplete and type-checking:

<!-- prettier-ignore -->
```ts
// holocron.config.ts
import { defineConfig } from "@theholocron/cli";

export default defineConfig({
  name: "my-app",
  providers: {
    vault: ["1password", { vault: "my-app" }],
    source: "github",
  },
});

```

### Auto-derived fields

`name` and `repo.name` are optional. When absent, Holocron fills them
in at load time:

| Field       | Derived from                                         | Fallback           |
| ----------- | ---------------------------------------------------- | ------------------ |
| `name`      | `package.json` → `name` field (scope stripped)       | directory basename |
| `repo.name` | `git remote get-url origin` (parsed to `owner/repo`) | not set            |

A minimal config — for repos with a `package.json` and a GitHub remote
— only needs `providers`:

### repo options

Additional `repo` fields recognised by `holocron setup`:

| Field             | Type                                    | Description                                                                                                                                                                |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repo.teams`      | `Array<string \| { slug, permission }>` | GitHub teams granted repo access. String shorthand defaults to `push` (Write). `holocron setup` also writes `.github/CODEOWNERS` for teams with `push`/`maintain`/`admin`. |
| `repo.topics`     | `string[]`                              | GitHub topics set on the repository.                                                                                                                                       |
| `repo.protection` | `"balanced" \| "strict" \| "none"`      | Branch-protection preset applied by `holocron setup`. For `"strict"`, the required status checks are derived from the task manifest — see below.                           |
| `repo.properties` | `RepoProperties`                        | Org-level custom property values synced to the GitHub dashboard.                                                                                                           |

### Required status checks (`protection: "strict"`)

`holocron setup` builds the branch-protection required-check list from the
manifest, not a hand-maintained array:

- `"DCO"` (hard-prepended), then
- every `{ required: true }` task's workflow check context (`Lint / Conclusion`,
  `Test / Conclusion`, `Typecheck / Conclusion`, `audit / Conclusion`), walked
  in CI order, then
- the top-level `extraRequiredChecks` (codecov gates, a bundle-build check, …).

```ts
export default defineConfig({
  tasks: [
    { name: "lint", required: true },
    { name: "test", required: true },
    { name: "typecheck", required: true },
  ],
  extraRequiredChecks: ["codecov/patch", "codecov/project"],
  repo: { name: "acme/app", protection: "strict" },
  providers: { source: "github" },
});
```

### Git hooks

```ts
export default defineConfig({
  hooks: true, // or { prePush: true }
  repo: { protection: "strict" },
  providers: { source: "github" },
});
```

`holocron setup` writes `.husky/pre-push` (runs `holocron ci` before every
push) and sets `package.json#scripts.prepare` to `husky`. On by default for
`protection: "strict"`; `false` / `{ prePush: false }` opts out. `holocron
setup --hooks` / `--no-hooks` override per run. Bypass one push with `git push
--no-verify`.

### Task scripts

`holocron sync` reconciles `package.json#scripts` from the `tasks` manifest
(merge, never clobber — only the managed keys are touched):

```ts
export default defineConfig({
  tasks: ["test", "lint", "typecheck"],
  // syncScripts: false,                              // disable the step
  // holocronScript: "node packages/cli/dist/cli.mjs", // override the "holocron" entry
  providers: { source: "github" },
});
```

Writes `"holocron": "<holocronScript ?? 'holocron'>"` plus one
`"<task>": "holocron run <task>"` per runnable task. `syncScripts: false`
opts out entirely.

### `holocron run`

```bash
holocron run <task> [job] [--required] [--filter <pkg>] [--dry-run] [-- <passthrough>]
```

Runs one task locally — resolving turbo vs the package manager vs the tool
itself. A `job` argument targets a sub-job of tasks that have them: `holocron
run audit performance` runs Lighthouse CI, `holocron run audit knip` runs Knip,
`holocron run audit` (no job) runs every audit sub-job in declared order. A
sub-job whose tool isn't installed, or that has no local equivalent
(`bundle-size`), is skipped with a note — `--required` makes that a failure. For
a task with no sub-jobs the `job` slot is the first passthrough arg
(`holocron run build src/`).

### `holocron ci`

```bash
holocron ci [--all] [--filter <pkg>] [--dry-run]
```

Runs the merge-gating checks locally, in CI order, exiting non-zero on the
first failure — the "will my PR be green?" pre-flight, and what the
`pre-push` hook runs. Default scope is every `{ required: true }` task
(falling back to every `ci: true` task when nothing is marked required).
`--all` forces the full set; `--filter` is a `turbo --filter=` passthrough.
Order comes from the `CI_ORDER` constant in `@theholocron/astromech`
(`typecheck → lint → test → build → …`). Tasks with no local equivalent
(`codeql`, `deploy`) are reported as enforced-in-CI, never failures; `audit`
expands into its sub-jobs (each under its own `audit / …` check context)
unless the repo ships its own `"audit"` script.

### Lint parity

The `lint` task takes an optional `linters` array — one list that drives
**both** the CI `lint` job (super-linter's `VALIDATE_*` env, baked into the
generated `.github/workflows/lint.yml` thin caller as a `super-linter-env`
input) **and** `holocron run lint` locally. Omitted → auto-detected from the
config files present plus the org always-on set.

```ts
export default defineConfig({
  tasks: [{ name: "lint", linters: ["eslint", "prettier", "yamllint", "actionlint", "gitleaks"] }],
  providers: { source: "github" },
});
```

### Skills installer

`holocron setup` can install shared skills from `@theholocron/skills` into the local repo:

```ts
export default defineConfig({
  agent: "claude", // "claude" | "codex" | "gemini"
  skills: ["git-safety", "pr-workflow"], // skill names from @theholocron/skills
  providers: { source: "github" },
});
```

Skills are copied to `.agents/skills/<name>/` and symlinked at the agent's expected path (e.g. `.claude/skills/<name>`). All installed paths are added to a managed block in `.gitignore` automatically.

<!-- prettier-ignore -->
```jsonc
{ "providers": { "source": "github" } }
```

Set `name` explicitly whenever the derived value would be wrong: content
repos without a `package.json` (e.g. `.github`) will fall back to the
directory basename, which may not match what your vault or deployment
provider expects as a project identifier.

### Shareable configs

**Level 1 — per-capability config packages.** Reference a published
package in any provider slot and Holocron resolves its bundled
`{ provider, options }` automatically. Per-project options merge on
top (project wins):

<!-- prettier-ignore -->
```ts
providers: {
  vault: '@acme/holocron-vault',                     // preset only
  source: ['@acme/holocron-github', { repo: 'x' }], // preset + override
}

```

A capability config package exports a `CapabilityConfigPackage` default:

<!-- prettier-ignore -->
```ts
import type { CapabilityConfigPackage } from "@theholocron/cli";
export default {
  provider: "1password",
  options: { vault: "acme-app" },
} satisfies CapabilityConfigPackage;

```

**Level 2 — whole-config presets.** Because the config file can be
JS/TS, a shared base is an import:

<!-- prettier-ignore -->
```ts
// holocron.config.ts
import { acmeConfig } from "@acme/holocron-config";
export default acmeConfig;

```

## Auth — fine-grained tokens

Each GitHub capability resolves its own fine-grained PAT so a compromised
credential only affects that feature. Store them once in the OS keyring
(macOS Keychain, Windows Credential Manager, libsecret on Linux):

```sh
holocron auth set github.read     ghp_xxx  # clone + CI run listing
holocron auth set github.issues   ghp_xxx  # issue management
holocron auth set github.sync     ghp_xxx  # sync-github workflow templates
holocron auth set github.release  ghp_xxx  # semantic-release
holocron auth set github.admin    ghp_xxx  # setup, secrets, environments
```

The resolution chain per capability is:

```
--token flag → HOLOCRON_<FEATURE>_TOKEN env var → keyring("github.<feature>")
```

See [`docs/tokens.md`](../../docs/tokens.md) for required PAT scopes per feature.

Additional `auth` subcommands:

```sh
holocron auth check github.read   # re-verify a stored token
holocron auth unset github.read   # remove a stored token
holocron auth list                # show all stored providers
```

## Logging

Operational output goes through [`@theholocron/logger`](../logger) — separate from
the user-facing `print` surface. Global flags:

```sh
holocron doctor --verbose   # log level → debug (full structured output)
holocron doctor --quiet     # log level → error (suppress info + warn)
holocron doctor --debug     # print "Run ID: <uuid>" at command end for Axiom lookup
```

Level resolution (highest priority first): `--verbose` / `--quiet` →
`HOLOCRON_LOG_LEVEL` → `log.level` in `holocron.config` → `"info"`.

```ts
export default defineConfig({
  log: { level: "warn" },
});
```

Axiom shipping activates when a token (`HOLOCRON_AXIOM_TOKEN` / `AXIOM_TOKEN`
→ OS keyring `axiom.<org>` → `axiom`) **and** a dataset
(`HOLOCRON_AXIOM_DATASET` / `AXIOM_DATASET` → `log.axiom.dataset` in
`holocron.config`) both resolve; env vars win. The token is never read from a
config file. See the [logging guide](https://docs.theholocron.dev/holocron/logging/).

### Telemetry

The CLI reports on itself through three sinks: **Sentry** (errors), **Axiom**
(logs), and **PostHog** (anonymous usage analytics — command frequency,
duration, failure rates, keyed to a one-way `sha256(hostname + username)`
fingerprint). PostHog activates from `HOLOCRON_POSTHOG_PROJECT_TOKEN` → `POSTHOG_PROJECT_TOKEN`
→ a shipped ingest-only key (on by default). `HOLOCRON_TELEMETRY=false` disables
all three. See the [telemetry guide](https://docs.theholocron.dev/holocron/telemetry/).

## What's in here

- `src/capabilities/` — the 14 capability interfaces that providers
  implement
- `src/config.ts` — config schema, `defineConfig`, `resolveConfig`,
  `CapabilityConfigPackage`
- `src/config/load-config.ts` — `loadConfig` — reads `holocron.config.*`
  (file discovery via [`@theholocron/datapad`](../datapad))
- `src/define-config.ts` — `defineConfig` typed pass-through
- `src/logger.ts` — CLI-side `@theholocron/logger` wiring (`buildCliLogger`,
  `resolveLogLevel`)
- `src/loader.ts` — `PluginLoader` — dynamic-imports plugins, resolves
  capability config packages, builds the capability registry
- `src/cli.ts` — yargs entry, dispatches subcommands. `holocron run` / `ci` are
  delegated to [`@theholocron/astromech`](../astromech) (`createAstromech`).
  `holocron sync` / `holocron setup` write each repo's `.github/workflows/*.yml`
  thin callers from `astromech.thinCallers()`; `holocron sync-github` pushes the
  reusable `workflow_call` implementations + composite actions from
  `astromech.reusableTemplates()` to `theholocron/.github` (a pure sync target —
  never hand-edit its `.github/workflows/*`).
- `src/commands/` — `setup`, `sync`, `doctor`, `deploy`, `secret set`,
  `secrets sync`, `npm publish-initial`, `sync-github`, `upgrade node`,
  `plugin create`, `auth`

## Status

Published on npm under the `alpha` dist-tag. APIs may still shift before
stable v2.0.0. Design in
[`docs/wiki/specifications/tech-architecture.spec.md`](../../docs/wiki/specifications/tech-architecture.spec.md).
