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

## Interactive mode

Run `holocron` with no command, a parent command with no subcommand
(`holocron auth`, `holocron repo`, `holocron repo upgrade`, …), or a leaf command
missing a required positional (`holocron deploy`, `holocron secrets set`), and
you get a prompt instead of a `--help` dead end.

The menu mirrors the command tree: each level shows only the next word, and a
group (marked `›`) opens its own submenu, as deep as the commands nest. Nothing
is shown as a `<command> <subcommand>` path — `config show` is `config ›` then
`show`. Every submenu has a `← back` item, and a command that is also a group
(`repo sync`, `deploy`) has a `(run it)` item at the top of its submenu. Typing
searches the whole tree — `upgrade` at the top finds the `repo` group — with
name matches ranked above description matches.

```console
$ holocron
? What would you like to do? › repo
❯ repo ›
? repo — choose a subcommand: › upgrade
? repo upgrade — choose a subcommand: › node
? Target Node.js major version: › 24
```

For a command that declares options (so far: `package publish` — more are
rolled out one command group at a time), it also offers those: any required
option is prompted like a positional, and everything else goes through one
"Set any options?" checkbox, prompting only what you picked:

```console
? Set any options? (space to select, enter to skip) › ◉ npm dist-tag ◯ One-time password (2FA)
? npm dist-tag (blank = latest): › beta
```

`package publish` specifically has three workflows that don't mix — a
steady-state publish, a one-shot `--initial` bootstrap, and a `--sync-trust`
maintenance run — so it asks which one first, then only offers that
workflow's own options; nothing from a different workflow is ever shown:

```console
? What would you like to do? › Initial publish (--initial)
? Set any options? (space to select, enter to skip) › ◉ One-time password (2FA)
...dry-run output...
? Dry run complete — proceed with the real run? › yes
? One-time password (2FA), if npm requires it for this publish: › ***
```

Each workflow's label ends with its real flag in parentheses when it has
one, and a longer caveat ("use only for a package's very first publish")
shows as helper text under the highlighted choice rather than bloating the
label itself.

A secret option (`--otp`) is masked as you type and delivered to the spawned
command through its environment, never its argv — `ps` and shell history
both expose a child's argv, never its env. A time-sensitive one like `--otp`
is checked off early but not actually typed until right before the real run
— after the dry-run preview and the "proceed?" question, never before —
since a dry run never checks it anyway and a code typed any earlier risks
going stale while something else is still being answered.

Whether an option is _checkbox-optional vs. always included_ and _collected
upfront vs. collected last_ are independent choices. `package publish`'s
`--otp` is always collected last, but whether it's checkbox-optional depends
on `HOLOCRON_NPM_ENFORCE_2FA`: unset (the default), it's opt-in like any other
checkbox pick; set in your own shell profile (never checked into the repo),
it's always included — for an operator whose own npm account enforces 2FA
on every publish, so the box doesn't need re-checking every single run.
Setting it has no effect on anyone else publishing from the same repo.

The picked command spawns as a normal `holocron <command> …` invocation —
`--token`, `--org`, `--cwd`, and `--dry-run` on the original invocation carry
through. A non-interactive shell (CI, a script, a pipe) gets the old
hard-failure message instead of hanging on a prompt.

For a command whose handler honours `--dry-run` (most of them — everything
except `auth *` and `config show`), the menu always previews it first — a
dry run doesn't mutate anything, so there's nothing to ask permission for —
then asks the one real decision:

```console
...dry-run output...
? Dry run complete — proceed with the real run? › yes
```

A preview that reports nothing would actually change (e.g. `clone` finding
every repo already cloned) skips that question too — there'd be nothing for
the real run to do either. `--skip-dry-run` opts out of the preview
entirely, straight to the real run, for when you already know what you want.

## Execution contexts

Every command is tagged with how much of a repo it needs:

| Context      | Needs                                                    | Examples                                                                                                                          |
| ------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `global`     | the CLI binary alone                                     | `version`, `clone`, `new repo` / `plugin`, `repo upgrade …`, `auth set` / `check`, `package …`, `run lint commit-msg`, `skills …` |
| `repo-aware` | `./holocron.config`, walking up from cwd, no plugins     | `run`, `run ci`, `config show`, `repo sync readme`, `deploy on-release`                                                           |
| `workspace`  | the `@theholocron/holocron-plugin-*` packages resolvable | `doctor`, `repo setup`, `repo sync`, `repo cleanup branches`, `secrets …`, `deploy`, `sync github`                                |

A `workspace` command run from a bare global install (no plugins next to the
CLI) fails with one actionable line — install the plugins as devDependencies or
use `pnpm exec holocron <cmd>`. `auth check` degrades to "token present,
verification skipped" instead. `holocron --help` prints the grouping; see
[Execution Contexts](https://docs.theholocron.dev/holocron/execution-contexts).

### Viewing the resolved config

`holocron config show` prints the resolved config. On a TTY it opens a foldable
tree by default; piped or redirected, it always emits plain, valid JSON
(`holocron config show | jq`).

```console
holocron config show                  # TTY: foldable tree (↑↓ move, →/⏎ expand, ← collapse, E/C all, q quit)
holocron config show --depth 2        # static coloured tree, anything nested deeper than 2 levels collapsed
holocron config show --no-interactive # static coloured tree, fully expanded
```

Passing `--interactive` explicitly needs a TTY on stdin and stdout and fails
with a one-line message otherwise; the default falls back to static output. It has no extra dependencies — nothing to install.

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

### The `.holocron/` directory

A big declaration can live in a file next to the config instead of inline, so `holocron.config.ts` stays a short index
of choices. `.holocron/<area>.{ts,js,mjs,cjs,json}` is read by name, and the areas are a closed list (a file not on
the list is never read):

| File                        | Where it lands                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `.holocron/notifications.*` | the `layout` option of the `providers.notifications` entry (which keeps `guildId`) |
| `.holocron/repo.*`          | keys of `repo` (`defaultBranch` stays inline: Sentinel needs it first)             |
| `.holocron/org.*`           | provider options the config leaves out (`teamId`, `accountId`), see below          |

The file's default export is the value (`.ts` keeps its comments; `.json` needs no `import`, for repos with no
`package.json`). If both exist for one area, `.ts` wins over `.json`. A missing directory changes nothing. Setting the
same thing inline and in a file is an error that names both (`the notifications layout is set in providers.notifications
and in .holocron/notifications.ts`, `repo.topics is set in the config and in .holocron/repo.json`): there is no merge and
no precedence. An area file may `import` a sibling in `.holocron/`. Never put a secret in the directory: it is public in
a public repo.

To type the layout, import the type and use `satisfies` (there is no `defineLayout()` helper; the type-only import keeps
runtime code out of a file Sentinel evaluates from the default branch):

```ts
import type { NotificationsLayout } from "@theholocron/cli";

export default {
  // comments stay
  testChannel: "holonet",
} satisfies NotificationsLayout;
```

This repo's own Discord layout lives in `.holocron/notifications.ts`; `holocron.config.ts` keeps only `guildId`.

`RULES.md` and the webhook avatar live in `.holocron/` too (`.holocron/pinned/rules.md`, `.holocron/media/webhook-avatar.png`),
but they are not areas: the layout names them with an explicit repo-relative path (`pinned: [{ channel, file }]`,
`webhookAvatar`). `.holocron/projects/<name>.json` is the project-board template folder (SPEC-0020), read by its own
default and not placed into the config.

**Sentinel** reads the directory too, so its PR config check, property sync and role sync see the same merged config as
the CLI. It lists `.holocron/` at the config's ref and fetches the whole tree (any depth, so an area may import a
sibling), within caps: 50 files, 100 KB per file, 512 KB in all. Past a cap, or on an area file that does not load,
the check reports a load error. Only what the config or an area file imports is evaluated. The design and the decisions
are in `docs/wiki/specifications/tech-holocron-directory.spec.md` (SPEC-0069).

**Keys that never move out of `holocron.config.ts`.** `repo.defaultBranch`, because the config is the one file read
before the directory, and the default branch is what says which branch holds `.holocron/` and the config. Every other
top-level key (`name`, `org`, `domain`, `providers`, `tasks`) also stays, but only because the closed list of areas has
no entry for it: Sentinel's `validateConfig()` reads none of them before it fetches `.holocron/` (it needs the config
file's path and the `ref`, nothing from inside it). Keys that a preset spreads into `repo` (`protection`, `properties`,
which `syncPropertiesFromConfig()` reads) stay inline too, since a key set both inline and in the file is an error. There
is no per-key precedence: the loader does not let an inline key win, it refuses the duplicate and names both places. This
repo's `.holocron/repo.ts` holds `teams`, `topics`, `variables` and `secrets`, names and identifiers only, typed with
`satisfies RepoConfig` (a type-only import).

**The `org` area** (#1820). The organization's constants that are provider options and that CI does not need:
`.holocron/org.ts` is `{ cloudflare: { accountId }, vercel: { teamId }, checkly: { accountId } }` (typed with
`satisfies OrgConfig`). The loader fills each of these into every provider entry of that name that leaves the option
out, so the config can say `deployment: ["vercel", { domain }]` and `monitoring: "checkly"`. The same option set inline
and in the file is an error that names both (`vercel.teamId is set in providers.deployment and in
.holocron/org.ts`), with no merge and no precedence. A provider key or an option the area does not know is an error; a
provider the config does not use is ignored. The org area is shared: a config in a subdirectory (`apps/sentinel`)
also reads the repository root's `.holocron/org.ts` (the nearest ancestor with a `.git`), and its own
`.holocron/org.ts` wins for a key set in both, option by option; that is not an error, so an identifier written in the
root file needs no copy in the app. The other areas (`repo`, `notifications`) describe the repository and are not
shared. Anything CI needs (`CLOUDFLARE_ACCOUNT_ID`,
`TURBO_TEAM`, `AXIOM_DATASET`) stays out: it lives in 1Password and syncs to a GitHub variable (`repo.variables.sync`),
and nothing else carries a copy. `.holocron/org.md` (the agent contract the CLI embeds) is not an area: only
`.ts`, `.js`, `.mjs`, `.cjs` and `.json` are read.

### repo options

Additional `repo` fields recognised by `holocron repo setup`:

| Field             | Type                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repo.teams`      | `Array<string \| { slug, permission }>` | GitHub teams granted repo access. String shorthand defaults to `push` (Write). `holocron repo setup` also writes `.github/CODEOWNERS` for teams with `push`/`maintain`/`admin`.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `repo.topics`     | `string[]`                              | GitHub topics set on the repository.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `repo.protection` | `"balanced" \| "strict" \| "none"`      | Branch-protection preset applied by `holocron repo setup`. For `"strict"`, the required status checks are derived from the task manifest — see below.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `repo.properties` | `RepoProperties`                        | Org-level custom property values synced to the GitHub dashboard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `repo.variables`  | `{ repo?, org?, sync?, prune? }`        | GitHub Actions variables created and updated by `holocron repo setup`. Undeclared ones are left alone unless `prune` is on. `sync: [{ environment, keys, scope?, visibility? }]` names the vault environment `holocron secrets sync` fills Actions variables from (a separate environment from the secrets one; names only, a blank value is skipped, `doctor variables` expects the names). A name given as a literal and in `sync`, or `prune` with `sync`, is a config error.                                                                                                        |
| `repo.secrets`    | `{ repo?, org?, environments?, sync? }` | Names of the secrets that must exist, checked (never written) by `holocron doctor secrets`. Names only. The notification layout's secrets and a Chromatic project token are expected without being listed. `sync: [{ environment, keys?, scope? }]` declares the vault environments `secrets sync` fills from (it follows these entries, one step per scope, unless `--github-secret` is given; a blank value is skipped); the doctor expects their keys (every key the `vault` provider lists when `keys` is omitted, names only) at the `scope` (`repo`, `env=<name>`, `org=<name>`). |

### Custom properties synced to GitHub

`holocron repo setup` and `holocron repo sync` both call `syncProperties()` with two
kinds of fields — always one-way (`holocron.config.ts` → resolved →
properties; properties are never a second editable source of truth):

**Manual** — `repo.properties` states these explicitly:

| Property                 | Value                                          |
| ------------------------ | ---------------------------------------------- |
| `lifecycle`              | `"active" \| "experimental" \| "deprecated"`   |
| `open_source`            | `boolean`                                      |
| `runtime_environment`    | `"node" \| "browser" \| "universal" \| "none"` |
| `uses_external_packages` | `boolean`                                      |

**Derived** — computed from resolved config + `package.json`, not a config field:

| Property                           | Value                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `monorepo`                         | `boolean` — whether `pnpm-workspace.yaml` exists                                         |
| `holocron_branch_protection_level` | the active `repo.protection` preset                                                      |
| `holocron_profile`                 | repo archetype: `library` / `cli` / `plugin` / `template` / `app` / `docs` / `platform`  |
| `holocron_capabilities`            | provider capability keys actually wired in `providers: {}` (`multi_select`)              |
| `holocron_stack`                   | detected build/framework tooling — `next`, `vite`, `astro`, `tsdown`, … (`multi_select`) |
| `holocron_compliance`              | `"compliant" \| "non-compliant"` against a minimal `source` + `ci` baseline              |

Field definitions and derivation heuristics:
`docs/wiki/specifications/tech-holocron-platform.spec.md` → "Custom-properties sync — field
definitions (#677)".

The four derived fields' pure computation —
`deriveProfile()`/`deriveStack()`/`deriveCapabilities()`/`deriveCompliance()`
(plus their `HolocronProfile`/`DeriveProfileInput`/`PackageJsonLike` types)
— is exported from this package's public entry point, separate from the
local-filesystem reads (`readWorkspacePackageJsons()`) that gather their
inputs here. `@theholocron/sentinel`'s `syncPropertiesFromConfig()` reuses
these functions unchanged, gathering the same inputs over the GitHub API
instead (D8 — one derivation, two input sources, not two
implementations).

`missingCapabilities(capabilities)` is `deriveCompliance()`'s sibling —
same `REQUIRED_BASELINE` table, but returns _which_ required capabilities
are absent rather than whether any are. `@theholocron/sentinel`'s
`postCheckRun()` uses it to name what's missing on the check run it
posts, instead of reporting pass/fail.

### Required status checks (`protection: "strict"`)

`holocron repo setup` builds the branch-protection required-check list from the
manifest, not a hand-maintained array:

In the repo that holds the reusable workflows (holocron itself) the list is `ci / Required checks` and `DCO`. That is the aggregate
check (`ci/workflows/ci.yml`, written by `repo setup` / `repo sync` as `.github/workflows/ci.ci.yml`): it waits on
every `{ required: true }` task, the hand-written checks in `extraRequiredChecks` and its `codecov/*` statuses, and its
job summary lists each of them with a link, failing ones first. `DCO` stays its own required context. In any other
repo, which has no `ci` caller yet, the list is:

- `"DCO"`, then
- every `{ required: true }` task's workflow check context (`Lint / Conclusion`,
  `Test / Conclusion`, `Typecheck / Conclusion` while the repo is on the frozen reusables; `test:unit / Conclusion`,
  `typecheck / Run tsc --noEmit`, … once it moves to the flat ones), walked
  in CI order, then
- the top-level `extraRequiredChecks` (codecov gates, a bundle-build check, …).

```ts
export default defineConfig({
  tasks: [
    { name: "lint:code", required: true },
    { name: "test:unit", required: true },
    { name: "typecheck", required: true },
  ],
  extraRequiredChecks: ["codecov/patch", "codecov/project"],
  repo: { name: "acme/app", protection: "strict" },
  providers: { source: "github" },
});
```

The generated ruleset also sets `require_extra_approval_for_unattributed_changes:
false` — with `required_approving_review_count: 0` and a single maintainer, the
GitHub default (`true`) is an unsatisfiable block on any PR with an
unverified/unattributed commit. Repository-admin bypass still covers the real
risk. And the `codecov.yml` `holocron repo setup` writes carries `if_not_found:
success` on every status default, so an infra-only PR (dep bump, config,
lockfile — no coverable change) passes instead of hanging on a `codecov/*`
required check that never posts. It also ignores `**/*.mdx`, so a docs-only PR that
adds pages is not judged to change testable files and left with an empty upload.
A re-run of `holocron repo setup` backfills all of these into an existing repo.

### Default branch (`repo.defaultBranch`)

```ts
export default defineConfig({
  repo: { protection: "strict", defaultBranch: "alpha" },
  providers: { source: "github" },
});
```

`holocron repo setup` syncs GitHub's repo-level default branch (`HEAD`) — what a
fresh clone checks out, what `gh pr create`/the compare UI target by default,
and what Sentinel's `validateConfig()` reads (it only ever reads config from
the repo's default branch, never a PR ref — a deliberate security boundary).
Omit this field to leave GitHub's current setting untouched; most repos never
need it. It exists for a repo using a `main`/`alpha` prerelease-channel split
where active development happens on a non-`main` branch: set this to that
branch so Sentinel validates against what's actually being developed, then
change it back once that branch merges to `main` for a stable cut and stops
being the active branch.

### Doc-comment coverage

```ts
export default defineConfig({
  repoValidation: { docsCoverage: "required" }, // "off" (default) | "warn" | "required"
});
```

Controls `holocron probe docs patch` (skipped, reports without failing, or fails for an export a PR adds or changes
without a doc comment) and whether `holocron repo setup` adds the `documentation` flag and its statuses to
`codecov.yml`, informational for `"warn"`. It never touches the required checks. See the
[config docs](https://docs.theholocron.dev/holocron/config/#doc-comment-coverage).

### Git hooks

```ts
export default defineConfig({
  hooks: true, // or { prePush: true }
  repo: { protection: "strict" },
  providers: { source: "github" },
});
```

`holocron repo setup` writes `.husky/pre-push` (runs `holocron run ci` before every
push) and `.husky/pre-commit` (runs `gitleaks protect --staged` + `lint-staged`
before every commit — scoped to staged changes, not the whole history, so a
past false positive can't permanently block future commits) and sets
`package.json#scripts.prepare` to `husky`. Both on by default for
`protection: "strict"`; `false` / `{ prePush: false }` opts out. `holocron
setup --hooks` / `--no-hooks` override per run. Bypass one push with `git push
--no-verify`; bypass one commit with `git commit --no-verify`.

### Task scripts

`holocron repo sync` reconciles `package.json#scripts` from the `tasks` manifest
(merge, never clobber — only the managed keys are touched):

```ts
export default defineConfig({
  tasks: ["test:unit", "lint:code", "typecheck"],
  // syncScripts: false,                              // disable the step
  // holocronScript: "node cli/cli/dist/cli.mjs", // override the "holocron" entry
  providers: { source: "github" },
});
```

Writes `"holocron": "<holocronScript ?? 'holocron'>"` plus one script per runnable task, named by the task id
(`test:unit`) and one per suite (`test`, `lint`, `scan`): `turbo run <task>` in a pnpm workspace with a `turbo.json`
(or the tool's own command for a task that runs once at the root), `holocron run <task> --` in a single package.
`holocron probe generated check` fails on a root script that differs from what is generated. `syncScripts: false`
opts out entirely.

### Splitting the task manifest — `astromech.config.ts`

The `tasks` key (plus `syncScripts` / `holocronScript` / `hooks` /
`extraRequiredChecks`) can move to a dedicated
`astromech.config.{ts,js,mjs,json}` at the project root:

```ts
// astromech.config.ts
import { defineConfig } from "@theholocron/astromech/config";

export default defineConfig({
  tasks: [{ name: "lint:unused", required: true }, "publish-wiki"],
  syncScripts: false,
});
```

`@theholocron/astromech`'s `loadTasksConfig` merges it over
`holocron.config`'s `tasks` — **task arrays concatenate**
(`holocron.config` first), the dedicated file **wins on scalars**,
`extraRequiredChecks` concatenate. `holocron run` / `holocron run ci` /
`holocron repo setup` / `holocron repo sync` all read the merged result, so the
split is transparent. Useful for keeping the capability/provider config
and the "what this repo runs" manifest in separate files (this repo does).

### `holocron run`

```bash
holocron run <task | suite> [qualifier | job] [--check] [--required] [--filter <pkg>] [--dry-run] [-- <passthrough>]
```

Runs one task, or a suite, locally — resolving turbo vs the package manager vs the tool
itself. Ids are flat and verb-first: `typecheck`, `build`, `test:unit`, `lint:code`.
`holocron run test` runs the `test` suite (every `test:*` leaf the repo lists, in registry order, each reported),
`holocron run test unit` and `holocron run test:unit` run one leaf. The words are joined with `:` and the longest match
wins, so `deploy preview` is `deploy-preview`; the rest is the `job` argument. A `job` targets a sub-job of the tasks
that have them (`holocron run lint commit-msg <file>`). A leaf whose tool isn't installed, or that has no local
equivalent, is skipped with a note — `--required` makes that a failure. For a task with no sub-jobs the `job` slot is the first passthrough arg
(`holocron run build src/`). `holocron run format` writes (prettier), `holocron run format --check` is read-only.
`holocron run --help` lists the tasks grouped under the six intent groups. The old dotted names
(`verification.unitTests`, `sourceQuality.formatting`, …) still work and print a deprecation notice on stderr. <!-- holocron-allow-old-name -->

**CI runs the identical command.** The reusable workflows (`typecheck`, `test-unit`,
`lint-code`, …) call the `holocron` composite action
(`theholocron/.github/.github/actions/holocron@main`), whose body is
`holocron run <task> [job]`. So `holocron run test:unit` locally and the `test:unit` CI
job execute the same thing — at a turbo root both are
`turbo run <task>`. `test:unit` always runs with coverage (`vitest run --coverage`); there is no `--coverage` flag.

### `holocron deploy on-release`

```bash
holocron deploy on-release [--channel <alpha|main>] [--from <commit>] [--to <commit>] [--dry-run]
```

Deploys every workspace package whose own `holocron.config` declares
`{ name: "deploy", with: { on: "release" } }` (holocron#930), when the
release (`--channel`: its prerelease identifier, or `main`/empty for a stable
release) is on the task's `channel` (default `main`, the stable release) and changes the package or one of its
`workspace:*` dependencies between `--from` (the previous release's commit,
omitted when there is none) and `--to` (default `HEAD`). It waits for npm to
serve the release's new dependency versions, then runs `pnpm --filter <pkg>
deploy`. A package that doesn't apply is skipped; a deploy that
doesn't succeed exits non-zero. The shared `release` workflow runs it as its own
`deploy` job after the release job (opt in with `deploy-on-release: true`).

### `holocron run ci`

```bash
holocron run ci [--all] [--filter <pkg>] [--dry-run]
```

Runs the merge-gating checks locally, in CI order, exiting non-zero on the
first failure — the "will my PR be green?" pre-flight, and what the
`pre-push` hook runs. Default scope is every `{ required: true }` task
(falling back to every `ci: true` task when nothing is marked required).
`--all` forces the full set; `--filter` is a `turbo --filter=` passthrough.
Order comes from the `CI_ORDER` constant in `@theholocron/astromech`
(`typecheck → lint:code → … → test:unit → build → …`). Tasks with no local equivalent
(`scan:code`, `deploy`) are reported as enforced-in-CI, never failures. `format` runs in its
read-only `--check` form.

### `holocron deploy`

`holocron deploy <branch>` (a Git-linked deployment) and `holocron deploy
--files <dir>` (a directory of build output, no linked repo) both trigger a
deployment through the configured `deployment` capability, then **wait for
it to finish**. The command reports success, exit code 0, only when the
deployment reaches `ready`. A deployment that ends `error` or `cancelled`,
or is still building after 10 minutes, is a failure: the exit code is
non-zero and the output includes the provider's own reason
(`DeploymentRecord.errorMessage`, e.g. Vercel's `Command "npm install"
exited with 1`). Providers build asynchronously, so accepting a deployment
isn't the same as it going live (holocron#911).

Provider plugins support this through the `Deployment` capability's
existing `getDeployment(id)`. They should set `errorMessage` on the
returned `DeploymentRecord` whenever the provider exposes one.

### `holocron monitoring check <url>`

Runs every configured `monitoring` check against `<url>` instead of each
check's own configured `url` — no vendor API call, only a plain HTTP
request evaluated locally against the exact same `assertions` already in
`holocron.config.ts`. Built for CI: the `check-preview` task runs
this against a PR's Vercel preview deployment (triggered by
`deployment_status`, not `push`/`pull_request`), reusing the production
check definitions to catch a breaking change before merge instead of
after (holocron#1010).

```ts
export default defineConfig({
  tasks: ["check-preview"],
  providers: {
    monitoring: ["checkly", { accountId: "...", checks: [/* ... */] }],
  },
});
```

Exits non-zero if any check fails — the job's own pass/fail is what
posts as the GitHub check, no separate reporting step needed.

### Skills installer

`holocron repo setup` can install shared skills from `@theholocron/skills` into the local repo:

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

## Notifications — server as code

A `notifications` provider can declare a whole server in `holocron.config.ts`
(`layout`: categories, channels, roles, access, server settings, welcome screen,
pinned messages, onboarding, the bot application) and the CLI applies and checks it. The
commands and the config are provider-neutral; Discord is the first provider.

| Command                                                                     | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `holocron notifications setup`                                              | Applies the layout; looks everything up by name first, so a re-run changes nothing that matches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `holocron notifications channel add <name>`                                 | Creates one channel (optionally with a webhook whose URL is stored as a secret)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `holocron notifications create-server --name <n> --owner <id>`              | Creates the server the layout describes, writes its id into the config, applies the layout, invites the owner, waits for them to join and hands the server over (`--resume` finishes an interrupted hand-over; `--force` allows a second server)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `holocron notifications link`                                               | Links your account on the provider to your GitHub account by signing in with the provider (OAuth, nothing secret kept)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `holocron notifications sync-roles`                                         | Makes who holds a role match a GitHub team, through the links file (`--keep` only adds; `--provider` picks one)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `holocron project reconcile [board]`                                        | Sets item statuses where a rule says so: an open blocker means `blocked`, no blocker left means `planned`, closed means `done` (status only; `--dry-run` previews; an open item with no status is reported). Runs hourly from `platform.projectReconcile.yml`, which `repo setup` writes when `providers.projects` declares boards                                                                                                                                                                                                                                                                                                                                     |
| `holocron doctor notifications [--built-only] [--deliver] [--post]`         | Step by step: does the server match the layout, do the secrets exist, and does a person (not the bot) own it. A full run also leaves one `🧪 test:` post in the layout's `testChannel`; `--built-only` posts nothing; `--deliver` posts to every channel and removes each post; `--post [channel]` posts the result as the bot (the failures, or only the summary when none failed). It also reads the Checkly feed (webhook, alert channel, subscriptions), the Comlink relay (Worker, route, bindings, the tracker's integration and rule) and the Notifications workflow (the file, and the secrets it reads), posting nothing, so `--built-only` keeps those steps |
| `holocron doctor variables`                                                 | Do the Actions variables `repo.variables` declares exist, with those values (and, for the organization's, that visibility)? One row for the repository and one for the organization, each only when declared. Read-only. A `repo.variables.sync` entry adds one row that checks its names exist (no value is read or shown). An undeclared variable counts only with `prune`; a scope that cannot be read (no provider, no org token) is a skip, not a failure                                                                                                                                                                                                         |
| `holocron doctor ci`                                                        | Has the repo moved to the flat task vocabulary? One row each for the `tasks:` entries (a deprecated alias, with the id that replaces it), the generated callers (file, workflow and job name equal the task id), the `ci` aggregate's `expected` list (no id missing or stale) and where the callers point (`theholocron/.github` or holocron `ci-v1`). Read-only, no provider needed; exits 1 on a failure. The ruleset's checks are `doctor repo`'s                                                                                                                                                                                                                  |
| `holocron doctor environments`                                              | Do the deployment environments exist? The ones `repo setup` creates (`staging`, `production`, when an `environments` provider is configured) plus every environment `repo.secrets.environments` names. One row. A missing one fails; an extra one is never a problem; no provider with some named is a skip                                                                                                                                                                                                                                                                                                                                                            |
| `holocron doctor project [--post [channel]]`                                | Does each board `providers.projects.boards` declares exist and match its template? One row per board, status list, field, view and automation rule; the board's extras and the items `project reconcile` would fix (no status, closed but not done, open blocker but not blocked, blocked without a blocker) are `info` rows, never a failure. A template file that does not read fails, naming the file. Read-only; `--post` shares the failing rows through the `notifications` bot.                                                                                                                                                                                 |
| `holocron doctor credentials`                                               | Does the credentials environment exist, and does it hold every variable the configured plugins take? One row per variable and provider (`ok`, `fail` when missing, `skip` for an optional one not set), listing names only: it never reads a value, and says which spelling of the environment's name matched.                                                                                                                                                                                                                                                                                                                                                         |
| `holocron doctor repo`                                                      | Do the repository settings `repo setup` writes match the config? One row per group the config declares: description and homepage, default branch and merge settings, topics, custom properties, team access, branch protection; labels and security settings are always checked. Read-only. Reads through optional `Source` methods (`getRepoInfo`, `getProperties`, `listLabels`, `listTeamAccess`, `getRulesetDetail`, `getSecurity`); a group that cannot be read is a skip, not a failure                                                                                                                                                                          |
| `holocron doctor dns`                                                       | Do the DNS records the config makes setup write exist, pointing where they should? The preview domain's apex and wildcard CNAMEs (Cloudflare), the docs host a wiki provider asks for, and the relay Worker's proxied placeholder; one row per zone. A missing record, another target or a missing proxy fails; an extra record never does. A record `ensureCustomDomain()` returns is not checked, because asking for it creates the domain                                                                                                                                                                                                                           |
| `holocron doctor monitoring`                                                | Do the checks the `monitoring` provider declares exist in its account, matched by name, with the URL, method and (when stated) frequency, locations, activated, should-fail, body and assertions the config sets? One row. A check in the account that is not declared is never a problem. A provider that cannot list its checks, failed to load or has no token is a skip                                                                                                                                                                                                                                                                                            |
| `holocron doctor secrets`                                                   | Do the secrets the config says must exist (`repo.secrets`, plus the notification layout's webhook and role secrets and the Chromatic token) exist? One row for the repository, the organization and each environment, each only when something is expected there. Names only; an undeclared secret is never a problem. A scope that cannot be read is a skip                                                                                                                                                                                                                                                                                                           |
| `holocron doctor tokens`                                                    | For every token a configured plugin lists (every plugin that resolves one: GitHub's nine, Discord's three, Sentry's two, ...), looked up as the plugin does (its env var, the vendor's, then keyring) and verified with its `verifyToken`: set and accepted is ok (with how long is left, when the token expires), set and rejected fails, a token with 7 days or fewer left fails with `expires in N days: renew it`, not set is a skip. No token is printed. What a token may do is not checked, because GitHub does not return a fine-grained token's permissions                                                                                                   |
| `holocron doctor --all`                                                     | Runs every deep check (`doctor notifications`, `doctor variables`, ...) and prints one row each, then `N ok, N fail, N skipped` counted in checks. Exits 1 when any check failed. A check that cannot run (no provider, no token) is a skip with the reason. Read-only: notifications runs as `--built-only`, so it posts nothing                                                                                                                                                                                                                                                                                                                                      |
| `holocron probe [<provider> [<probe>]] [--dry-run] [--yes] [--lcov <path>]` | Poke a live provider on purpose: list the probes, inspect something, or run a proof that cleans up after itself. Plugins offer the probes; nothing secret is printed; one that changes things asks first                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Channels fed by another service are declared with `feeds` on the channel: `{ name: "uptime", webhook: true, feeds: { monitoring: true } }` (the object form `{ name?, webhook?, avatar?, alerts? }` overrides the alert channel's name, default `Message to #<channel>`, the dedicated webhook's name, default the provider's, and gives that webhook a picture, a file path or `https://` URL, or `{ url, image }` (the URL is tried first, the file in the repo is the fallback), else the provider's own icon (`Monitoring.icon`, a URL and an embedded `data:` image; Checkly provides one), else the layout's `webhookAvatar`). A channel's own `webhook.avatar` and the layout's `webhookAvatar` take the same forms, a path or `https://` URL, or `{ url, image }` (the URL first, the file in the repo as the fallback); a relative path is read from the repository root. `setup` gives the channel a dedicated webhook and hands its URL straight to the `monitoring` provider through `Monitoring.ensureAlertChannel({ name, format: "discord", url? })`, which finds an alert channel of that name or creates one and subscribes every check; the URL is never stored as a secret. It needs a `monitoring` provider that implements `ensureAlertChannel` (Checkly does). `alerts: { failure?, recovery?, degraded?, sslExpiry?, sslExpiryThreshold? }` (`MonitoringAlertSettings`, passed as `ensureAlertChannel({ ..., alerts })`) sets what the alert channel alerts about: a new channel defaults to failure, recovery and degraded on and `sslExpiry` off, and on an existing channel a setting left out is left alone. A check in the `monitoring` provider's `checks` can route itself with `alertChannels: ["Message to #uptime"]` (`MonitoringCheckInput.alertChannels`, the alert channel names): it is then subscribed to those channels only, and a name no feed declares is refused by `setup`. `inspectAlertChannel` returns the channel's `alerts` and the `misrouted` checks that `doctor notifications` reports. Two feeds may not share an alert channel name, and a feed's webhook may not share the channel's own webhook name (compared without regard to case).

Channels fed by the error tracker add `feeds: { errors: true }` and a layout `relay: { host, zone?, script?, code? }`: `setup` makes a dedicated webhook, points `host` at the Comlink Worker (a proxied DNS record via `dns`), and deploys it via `workers.deployScript` with the webhook URL as `COMLINK_<SOURCE>_WEBHOOK`. The URL never leaves the Worker's secret; other secrets on the script are kept. With `relay.errors: { projects, integration?, rule?, frequency? }` it also ensures the tracker's integration and alert rule (`errors.ensureRelay`) and deploys the Worker with the integration's signing secret. Needs `errors`, `workers` and `dns`; only one channel may be fed.

`holocron secrets sync <env> --worker <script>` also sets every key of the vault environment on a deployed Worker as a secret, through the optional `Workers.setSecret(script, name, value)` (write-only; the Cloudflare plugin implements it). The Worker must already exist. Sync only adds and updates: it never removes a binding, because a Worker also holds secrets that are not in the vault (for Comlink, the `COMLINK_<SOURCE>_WEBHOOK` that `notifications setup` sets), so a key deleted from the vault must be deleted from the Worker separately. Keys are written one at a time and each is reported; if one fails, the exit code is 1 and re-running finishes the rest, since every write is idempotent.

`holocron secrets sync <env>` also writes GitHub Actions **variables** when `repo.variables.sync` has an entry for that environment: each key goes through the `source` provider's `syncVariables` (repo scope) or `syncOrgVariables` (`org=<name>`), one call per key and never pruning, so a name the vault lacks or holds blank is skipped and GitHub keeps its value. Keep these in a vault environment of their own (a vault does not tell a visible value from a secret one, and a variable is readable afterwards). An environment declared only by variable entries pushes nothing to `secrets` or `deployment`. Values are never printed. `doctor variables` checks that the names exist at their scope.

`holocron secrets list [--scope repo|environment|organization] [--env <name>] [--json]` prints the names (never the values; GitHub does not return them) of the secrets at each scope, sorted, under a heading per scope. With no `--scope` it lists the repository, plus the organization (`--org`, `HOLOCRON_ORG` or the config's `org`) and the `--env` environment when they are known; `--scope` lists one. A scope that cannot be listed is reported under its heading and the rest are still listed; the exit code is 1 if any failed. `--json` prints `[{ scope, names, error? }]`. It is read-only, so `--dry-run` does not apply. Comparing the names with what the config expects is `doctor secrets`, which also covers the keys of the vault environments declared in `repo.secrets.sync`.

A channel with `kind: "forum"` is a forum, with `tags` (each a `name`, an `emoji` and whether it is `moderated`); `setup` adds and corrects the tags but never removes one, and a text channel of the same name must be deleted first, since neither kind can become the other. A forum takes no `webhook` or `feeds`. `defaultReaction` is the emoji Discord offers on every post (its Get Started step "Set a default reaction for posts"); Discord allows only one, so `starterReactions` lists more (`["👍", "👎", "❓"]` for approve, disapprove, question) that the bot adds to the first message of each post `specs sync` makes. Existing posts are left alone, a reaction the bot cannot add is skipped, and `doctor notifications` checks `defaultReaction`. Unicode emoji only.

`holocron specs sync [--channel <forum>] [--files <paths...>] [--pr <number>] [--refresh] [--refresh-origin] [--refresh-titles] [--withdraw] [--notify]` keeps one forum post per ADR and spec in step with the files: it makes the post (titled with the document's own title, tagged with the file's status), writes its address into the file as `discussion.url`, and turns a gatekeeper's retag into an edit of the file's `status:` line in the working tree for a pull request. `--files` syncs only those files and `--pr` names a pull request on their posts, for a pull request that is still open. `--refresh-origin` is a one-off repair: it rewrites the `PR:` line of existing posts to the one the current rule names (the optional `prLine` of `DiscussionPatch`, and of `DiscussionPost`), and nothing else in them. `--refresh-titles` is the same kind of one-off repair for the title: it renames each existing post whose title differs from the current rule's (the optional `title` of `DiscussionPatch`, and of `DiscussionPost`) and changes nothing else; a rate limit stops it cleanly, reports how many documents are left, and the next run continues. The id that opens a post is a link to the file on the default branch (`repo.defaultBranch`, else `HEAD`) once the file is there, and plain text while `--pr` names an open pull request; the normal sync rewrites a post's id line (and only that line) whenever it is not the one the rule gives and no `--pr` is given, which covers a file that moved and a post made while its pull request was open, so it needs no extra request when every post is right and `--refresh` is no longer needed for it. `--refresh` runs the `PR:`, title and id-link repairs in one pass (the id link is the optional `idLine` of `DiscussionPatch`, and of `DiscussionPost`, which changes only the message's first line); `--refresh-origin` and `--refresh-titles` still do only their own. `--withdraw` (with `--files`, on the base branch) tags the posts of a pull request closed unmerged `withdrawn` and closes them; `withdrawn` is a tag only, never a file `status:`, and the next sync puts the file's own status back. It cannot be combined with `--refresh`, `--refresh-origin` or `--refresh-titles`. `--dry-run` previews it. See the [`specs sync` page](https://docs.theholocron.dev/holocron/commands/specs-sync/).

Pinned messages are declared under the provider's `layout` as `pinned: [{ channel, content }]` or `pinned: [{ channel, file }]` (`channel` is a channel in the layout, `content` up to 2000 characters, `file` a text file in the repository, such as `.holocron/pinned/rules.md`, whose contents are the message and win over a hand edit; `doctor notifications` reports the drift); the layout is the whole set of messages the bot has pinned in those channels.

Config shape added for role sync and sign-in (all under the provider's `layout`):

| Field                         | Meaning                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testChannel`                 | The channel (it must declare a webhook) the doctor posts its one self-removing test message to.                                                             |
| `roles[].team`                | A GitHub team slug. The role follows that team: given to linked members, taken from linked people who left. Never touches holders nobody has linked.        |
| `links.hostedUrl`             | A hosted sign-in service (Sentinel). `link` asks `<hostedUrl>/api/link` and uses it when it answers `{ "service": "link" }`; otherwise it signs in locally. |
| `links.localPort`             | The port of the local sign-in listener (default `53682`, bound to `127.0.0.1` only).                                                                        |
| `links.repo` / `links.path`   | Where the links file lives (default `<org>/.github-private` and `notifications/<provider>-links.json`).                                                     |
| `application.intents.members` | Switches the Server Members Intent on or off (needed to list who holds a role).                                                                             |
| `application.redirectUris`    | Redirect URIs that must be registered. Check-only: the API cannot set them, so `setup` and the doctor say what to add in the developer portal.              |

The links file is `{ "version": 1, "links": [{ "github": "<id>", "login": "<login>", "member": "<id>" }] }`: two public ids per person.
It is read and written through the `source` capability with the `github.user-sync` token (fine-grained, **only** the
private config repo, Contents read and write), so no other token needs Contents on other repositories.

Capability surface behind it (all optional, so providers without the concept omit them):

- `Source.teamMembers(teamSlug, org?)`, `Source.readFile(path, repo?)` (returns the `version` a later write must present),
  `Source.writeFile(path, content, { message, version?, repo? })` (a changed `version` is refused: a real conflict check).
- `Notifications.createServer({ name, force? })`, `inviteLink(channel)`, `hasMember(id)`, `transferServer(id)` and `serverOwner()`: create a server, invite its owner, check they joined, hand it over, and say who owns it.
- `Notifications.roleMembers(role)`, `addRoleMember(role, memberId)`, `removeRoleMember(role, memberId)`.
- `Notifications.checkDelivery({ channel, name, category?, text })`: posts through a channel's webhook, reads the post back and removes it, and says which step failed.
- `Notifications.signIn()` returning `{ authorizeUrl, complete }`: the provider-neutral shape of "prove which account you own".
- `Notifications.ensureApplication` returns `{ updated, todo? }`; each `todo` is a step only a person can do (a portal setting
  the API ignores) and is reported as a failure until done.

Provider credentials for Discord: `discord.holonet` is the **bot token** (Bot → Reset Token), `discord.holonet.oauth` is the
**OAuth client secret** (OAuth2 → Reset Secret). They are different values; the API can create or read neither.

See the [command pages](https://theholocron.dev/holocron/commands/notifications-setup/) for each command's options.

## Cleaning up

- **`holocron repo cleanup branches [--local | --remote]`** — lists the branches whose pull request is merged,
  grouped, each saying whether it lives locally, on the remote or both; then asks, and offers a checklist with the
  proven-merged ones ticked. Proven merged means an ancestor of `origin/alpha` or `origin/main`, or the head (or an
  ancestor, or one of the commits) of a merged pull request. Branches with more commits than their merged PR, with
  an open PR, checked out (here or in a worktree), or never merged are listed unticked. `--dry-run` only lists;
  `--yes` deletes every proven-merged branch without asking. Pull requests and remote branches come from the
  `source` provider (`Source.listPullRequests`, `listPullRequestCommits`, `listBranches`, `deleteBranch`).

## Upgrading

- **`holocron repo upgrade node <to>`** — patches every Node.js version pin
  (`engines.node`, `.nvmrc`, `.node-version`, `.github/workflows/*`,
  `Dockerfile`, `.tool-versions`) to a new major. The rewrite is
  `runUpgradeNode()` in `@theholocron/astromech/upgrade`; the command only
  binds the logger and reads `upgrade.node.extra`.
- **`holocron repo upgrade deps`** — bumps every `@theholocron/*` pin in
  `pnpm-workspace.yaml` (`catalog:` and every named `catalogs.*`) to its latest
  published version, then migrates `holocron.config.ts` from the 7.x preset
  shape (`const { repo, workflows } = node()` + `repo.requiredChecks` +
  `workflows:`) to the current composed-preset API (`const preset = node()` +
  `...preset` + `tasks:` + `extraRequiredChecks:`). Mechanical transforms only —
  review the result, then `pnpm install && holocron run ci`. `--pins-only` skips
  the config migration; `--dry-run` prints without writing.

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
holocron auth set github.user-sync ghp_xxx # the files that link GitHub accounts to other services' members
```

The resolution chain per capability is:

```text
--token flag → HOLOCRON_<FEATURE>_TOKEN env var → keyring("github.<feature>")
```

See [`docs/tokens.md`](../../docs/tokens.md) for required PAT scopes per feature.

A plugin lists the tokens it takes in a `tokens: PluginToken[]` export (each resolver exposes its own as `.token`), as
`{ envName, vendorEnvName?, keyringKey, verifiable?, optional? }`, so `holocron doctor tokens`, `doctor credentials` and
`auth export` can find them. Set `optional: true` on a token the plugin only falls back to, such as the Discord
webhook a post uses when it names no channel: the checks that expect every listed token do not expect it, and
`auth export` marks it `(optional)` when it has no value. `verifiable: false` marks a token `verifyToken` does not
apply to.

Additional `auth` subcommands:

```sh
holocron auth check github.read   # re-verify a stored token
holocron auth unset github.read   # remove a stored token
holocron auth list                # show all stored providers
holocron auth export             # tokens as NAME=value lines in a private .credentials, to import into a credentials environment
holocron auth export --only HOLOCRON_SENTRY_TOKEN  # one token, to the clipboard
holocron auth export --blank --vendor-names --file --only VERCEL_TOKEN --only HOLOCRON_RELEASE_TOKEN  # the stored ones filled, the rest empty
holocron github-app create --name "My App - dev" --webhook-url https://<tunnel>/api/webhook --manifest apps/sentinel/github-app.manifest.json  # a GitHub App from a manifest (the flow is in @theholocron/dagobah); its id, key and webhook secret to a private .credentials
holocron tunnel up --name sentinel-dev --hostname sentinel-dev.example.dev --port 3000 --run  # a named tunnel with a stable hostname to a local port
holocron project list           # the org's project boards (also: create [template], close <number-or-name>, setup)
holocron project move v4 v5 --dry-run  # preview carrying the open items of one project board to another; without --dry-run it asks first (--yes skips)
holocron doctor project         # does each declared board match its template? (read-only; --post shares the failures)
holocron dev                    # the app, its vault variables and the tunnel, in one command (settings: `dev` in holocron.config)
```

## Logging

Operational output goes through `@theholocron/observability/logger` — separate
from the user-facing `print` surface. Local/interactive runs are quiet by
default: no colorized or raw structured console output, regardless of the
resolved level (Axiom shipping, when configured, is unaffected). CI is
untouched — its existing stdout output still appears. Global flags:

```sh
holocron doctor --log debug # show console output at this level (opt back in)
holocron doctor --verbose   # log level → debug, and shows console output
holocron doctor --quiet     # log level → error, and shows console output
holocron doctor --debug     # print "Run ID: <uuid>" at command end for Axiom lookup
```

Level resolution (highest priority first): `--log <level>` → `--verbose` /
`--quiet` → `HOLOCRON_LOG_LEVEL` → `log.level` in `holocron.config` →
`"info"`.

```ts
export default defineConfig({
  log: { level: "warn" },
});
```

Axiom shipping activates when a token (`HOLOCRON_AXIOM_TOKEN` / `AXIOM_TOKEN`
→ OS keyring `axiom.<org>` → `axiom`) **and** a dataset
(`HOLOCRON_AXIOM_DATASET` / `AXIOM_DATASET` → `log.axiom.dataset` in
`holocron.config`) both resolve; env vars win. The token is never read from a
config file.

The dataset side of that resolution is **execution-context-aware** (ADR-0012):
a `global`-context command (`clone`, `new`, `auth set`, `upgrade node`, `plugin
create`, …) always ships to holocron's own dataset regardless of `$PWD` — it
isn't "about" any repo, so routing it through whichever repo's `.envrc`
happens to be active would be wrong. `repo-aware` / `workspace` commands
(`doctor`, `deploy`, `sync`, …) keep the env-var/config chain above, so a
per-repo `HOLOCRON_AXIOM_DATASET` — e.g. via a `.envrc` + `direnv` — separates
each consuming repo's logs. See the [logging guide](https://docs.theholocron.dev/holocron/logging/).

### Telemetry

The CLI reports on itself through three sinks: **Sentry** (errors), **Axiom**
(logs), and **PostHog** (anonymous usage analytics — command frequency,
duration, failure rates, keyed to a one-way `sha256(hostname + username)`
fingerprint). PostHog activates from `HOLOCRON_POSTHOG_PROJECT_TOKEN` → `POSTHOG_PROJECT_TOKEN`
→ a shipped ingest-only key (on by default). `HOLOCRON_TELEMETRY=false` disables
all three.

For a committed, repo-wide opt-out, add a `telemetry` block to `holocron.config`
— the version-controlled peer of `HOLOCRON_TELEMETRY=false` (the env var still
wins; this is an override layer applied after config loads):

```ts
import { defineConfig } from "@theholocron/cli";

export default defineConfig({
  // …
  telemetry: {
    enabled: false, // no-ops Sentry + PostHog for every command
    // analytics: "none",  // alternative: PostHog off, Sentry error reporting kept
  },
});
```

Each SDK sits behind an interface from `@theholocron/observability` —
`ErrorSink` (Sentry) / `AnalyticsSink` (PostHog); the adapters, and the only
`@sentry/node` / `posthog-node` imports, live in that package. the orchestration is `createCliTelemetry` in `@theholocron/kyber/observability`;
`observability/telemetry.ts` binds it to the Holocron-specific credential resolution
(`observability/resolve-telemetry.ts`). See the
[telemetry guide](https://docs.theholocron.dev/holocron/telemetry/).

### ESLint bundle options

Most repos need nothing here — `@theholocron/eslint-config`'s `library()`
bundle resolves with zero committed file (Bucket A: `eslint --config
<shared path>`, no per-repo `eslint.config.ts` needed). A package with a
genuine, deliberate exception — e.g. Web Crypto globals a Node-targeted
package still needs, exempted via `library()`'s own `browserPackages`
option in that package's own `eslint.config.ts` — should also declare the
same paths in `holocron.config`'s `eslint.browserPackages`:

```ts
export default defineConfig({
  eslint: {
    browserPackages: ["clients/github-client/src/app-auth"],
  },
});
```

This doesn't replace the package's own `eslint.config.ts` (local/CI linting
still resolves that file directly) — it's the signal Sentinel's centralized
static-analysis check (holocron#849/#858) reads instead, since that check
never reads a PR's own committed config files. Without it, Sentinel flags a
false-positive `eslint-plugin-n` node-builtins finding on exactly the files
the local override exists to exempt.

## What's in here

- `src/plugin/capabilities.ts` — the 21 capability interfaces that
  providers implement
- `src/config.ts` — config schema, `defineConfig`, `resolveConfig`,
  `CapabilityConfigPackage`
- `src/config/config-system.ts` — `defineConfig`, `loadConfig` (reads `holocron.config.*`;
  file discovery via [`@theholocron/datapad`](../datapad)) and `compose`, all built from
  kyber's `createConfigSystem`; Holocron's own rules sit beside it in `config/config`,
  `compose/{merge-*,task-name}` and `load-config/{derive-defaults,read-package-json-name}`
- `src/observability/logger.ts` — CLI-side `@theholocron/observability/logger` wiring
  (`buildCliLogger`, `resolveLogLevel`)
- `src/plugin/loader/loader.ts` — `PluginLoader`, a binding of kyber's `createPluginSystem`
  (`@theholocron/kyber/plugins`: dynamic-imports plugins, resolves capability config packages,
  builds the capability registry); Holocron's prefix, plugin options and the credentials / `.env`
  step are passed in
- `src/cli.ts` — yargs entry, dispatches subcommands. `holocron run` / `ci` are
  delegated to [`@theholocron/astromech`](../astromech) (`createAstromech`).
  `holocron repo sync` / `holocron repo setup` write each repo's `.github/workflows/*.yml`
  thin callers from `astromech.thinCallers()`; `holocron sync github` pushes the
  reusable `workflow_call` implementations + composite actions from
  `astromech.reusableTemplates()` (written in `ci/`) to `theholocron/.github` (a pure sync target —
  never hand-edit its `.github/workflows/*`).
- `src/commands/` — `repo setup`, `repo sync`, `doctor`, `deploy`,
  `monitoring check`, `secrets list`, `secrets set`, `secrets sync`, `package publish`,
  `package bump-versions`, `package move-tag`, `sync github`, `repo upgrade node`,
  `repo upgrade deps`, `new plugin`, `auth`, `notifications setup`,
  `notifications channel add`, `notifications link`,
  `notifications sync-roles`, `doctor ci`, `doctor credentials`, `doctor dns`, `doctor environments`, `doctor monitoring`, `doctor notifications`, `doctor project`, `doctor repo`, `doctor secrets`, `doctor tokens`, `doctor variables`
  `notifications sync-roles`, `project reconcile`, `doctor ci`, `doctor credentials`, `doctor dns`, `doctor environments`, `doctor monitoring`, `doctor notifications`, `doctor repo`, `doctor secrets`, `doctor tokens`, `doctor variables`
- `src/commands/deep-checks/` — `DEEP_CHECKS`, the registry every `doctor <capability>` is
  listed in; the shared row renderer and `declaredVsActual` helper are in `@theholocron/kyber/ui`
- `src/interactive-menu/` — the interactive fallback's Holocron data: `command-catalog`
  (`COMMAND_REGISTRY`, built with kyber's `createCommandRegistry`; each entry's `positionals`/`options`), `run-menu-entries`
  and `probe-menu-entries` (menu entries built at run time), and `menu.ts`,
  kyber's `createMenu` bound to the `holocron` bin and `HOLOCRON_` env prefix.
  The engine itself (the picker, argv and secret env, the dry-run preview, the spawn)
  and the prompting pieces — `promptForPositionals`, `promptForOptions` — live in
  `@theholocron/kyber` (`/menu`, `/prompts`), which has no knowledge of commands.
- `src/plugin/connection-probe/` — the `connectionProbe` a plugin offers, kyber's `connectionProbe` (`@theholocron/kyber/checks`)
  typed as the plugin system's `Probe` with `verify` returning `VerifyTokenResult`; `monitoring check` runs its checks
  with kyber's `runCheckAgainstUrl`.
- `src/commands/move-tag/` — the `package move-tag` yargs command, the registry entry and `runMoveTag`, which adds the
  command-bound logger to kyber's `moveMajorTag` (`@theholocron/kyber/git`).

## Status

Published on npm under the `alpha` dist-tag. APIs may still shift before
stable v2.0.0. Design in
[`docs/wiki/specifications/tech-architecture.spec.md`](../../docs/wiki/specifications/tech-architecture.spec.md).
