<!-- editorconfig-checker-disable-file -->

# theholocron/holocron — agent operating contract

`CLAUDE.md` is a symlink to this file, so Claude, Codex, and every other agent
read the same rules. Put durable, repo-wide agent guidance here.

@../github-private/AGENTS.md

## Where code lives (org-wide rule)

Three repos, one rule per concern:

- **Shareable tool config (ESLint, Prettier, TSConfig, Vitest, …)** → `theholocron/configs`. If you find yourself copy-pasting a tool config across repos, it belongs there as a `@theholocron/*-config` package.
- **HTTP clients and API wrappers** → `theholocron/clients`. REST clients for third-party services and shared HTTP primitives live there.
- **Generic, dependency-light helpers (path walking, git remote parsing, JSON formatting, …)** → `theholocron/utils` as a `@theholocron/*-utils` package, consumed here through the `utils` catalog in `pnpm-workspace.yaml`. If the same helper is written twice in this repo, it belongs there.
- **Anything that can be automated** → `theholocron/holocron` (this repo). Infrastructure commands (`setup`, `upgrade`, `doctor`, `secrets sync`), CI orchestration, and repo lifecycle automation belong here in the Holocron CLI.
- **`holocron.config` format** — use `holocron.config.ts` with `defineConfig` in any repo that has a `package.json` (the CLI must be resolvable at runtime). Use `holocron.config.json` in content-only repos with no Node.js infrastructure (e.g., `.github`, `.github-private`).

## Architecture

- **Capability/provider model.** 18 capabilities defined in
  `packages/cli/src/plugin/capabilities/capabilities.type.ts`. Vendors implement N
  capabilities; ESLint-style `holocron.config.{json,js,ts}` wires them
  up. Use `defineConfig` from `@theholocron/cli` in JS/TS configs for
  typed autocomplete. `vault` is no longer required (removed constraint).
- **Server as code** (`notifications`, holocron#1098). A provider's `layout`
  in `holocron.config.ts` declares the server; `notifications setup` applies
  it and `doctor notifications` checks it. Names stay provider-neutral and no
  hosting is assumed (the hosted sign-in route is one web-standard handler,
  Vercel-specific only in its thin entry file). Anything the provider's API
  can do is automated; what it cannot (OAuth redirects, the client secret)
  is reported as a `todo` that fails the run until done. Role membership
  follows a GitHub team through a per-provider links file in the org's private
  config repo, read and written with its own `github.user-sync` token. The
  capability methods behind it are optional on `Source` and `Notifications`. A server can also be created from the layout (`notifications create-server`): the bot makes it and applies the layout as owner, writes the new id into the config, invites a person and hands the server over; the doctor fails while the bot still owns it.
- **Plugin packages** are named `@theholocron/holocron-plugin-<provider>`.
  Each follows the proven template: `auth.ts` + `rest.ts` (or `shell.ts`
  for CLI-transport) + `capabilities/<key>.ts` + `index.ts` exporting
  `createPlugin()`.
- **Task manifest → `@theholocron/astromech`** (ADR-0009, epic #581). One
  `tasks` array in `holocron.config` drives every workflow surface:
  `holocron run` / `holocron run ci`, each repo's `.github/workflows/*.yml`
  thin callers (`astromech.thinCallers()`, consumed by `holocron repo sync` /
  `holocron repo setup`), `package.json` scripts, the linter set, the
  branch-protection required checks, and the reusable `workflow_call`
  implementations pushed to `theholocron/.github`
  (`astromech.reusableTemplates()`, consumed by `holocron sync github`).
  The loop closes both ways: the reusable `typecheck` / `test` / `audit`
  workflows run their core step through the `holocron` composite action
  (`holocron run <task> [job]`), so CI executes the same command a
  contributor runs locally.
  A `delivery.deploy` task with `with: { on: "release" }` in a workspace
  package's `holocron.config` is a release-time deploy (#930): the shared
  `delivery.publish` workflow's separate `deploy` job runs `holocron
deploy-on-release` (`deployOnRelease()` in astromech) after the release job,
  and it generates no workflow of its own.
  The workflows read a few organization Actions variables (`vars.TURBO_TEAM`, `vars.CLOUDFLARE_ACCOUNT_ID`, …). They
  are declared in `holocron.config.ts` under `repo.variables` and written by `holocron repo setup`, never set by hand. A
  missing one fails quietly, so the templates warn and say where it is declared: the shared `setup` composite action
  when `TURBO_TOKEN` is set without `TURBO_TEAM`, and `preview.yml` (deploy and cleanup) when a Pages project is
  configured without `CLOUDFLARE_ACCOUNT_ID`. Account-specific values deliberately have no default in the templates.
  **`theholocron/.github` and `.github-private` are pure sync targets** —
  their `.github/workflows/*`, `.github/actions/*` and `workflow-templates/*`
  are generated from `packages/astromech/src/templates/` and pushed by
  `holocron sync github`; edit the source here, never those repos directly.
- **Standards (codified in `.claude/skills/holocron-skill-plugin/`):**
  - `--dry-run` global flag flows through `RuntimeContext.dryRun`;
    commands branch at the orchestrator layer, not in capabilities.
  - `--token` global flag is repeatable. Bare form (`--token <value>`)
    sets `RuntimeContext.cliToken` as fallback for all plugins. Keyed
    form (`--token vendor=value`, repeated per provider) sets
    `RuntimeContext.cliTokens`; `PluginLoader` routes each entry to
    the matching plugin by `tuple.provider`, falling back to `cliToken`
    for unmatched providers. Plugins always receive a single `cliToken`.
  - Cross-provider event sync uses normalized `AuthEvent` types in
    core + plugin-exported `parseWebhook(input): AuthEvent` utility
    (NOT a capability method). Swap auth providers without rewriting
    handlers.
  - **Execution context** (`packages/cli/src/commands/contexts/contexts.ts`,
    spec `tech-cli-execution-contexts`, #576). Every command is tagged
    `global` (binary only), `repo-aware` (`./holocron.config`, no
    plugins) or `workspace` (plugin packages resolvable). New commands
    MUST get a `COMMAND_CONTEXTS` entry — `contexts.test.ts` fails
    otherwise. A `workspace` command calls
    `assertPluginsResolvable(loader, name)` right after `loader.load()`;
    it throws `WorkspaceContextError` (printed cleanly by `cli.ts`'s
    `USER_FACING_ERRORS` catch) only when every provider errored with a
    missing-package error — the global-install case.
  - **Interactive fallback** (`packages/cli/src/interactive-menu/`, spec
    `tool-interactive-cli-menu`, #438). A command with a required positional
    gets a `COMMAND_REGISTRY` entry so a missing arg prompts instead of
    hard-failing; interactive prompting itself stays inline in `cli.ts`'s
    handler bodies (the same place `new repo` / `new plugin` already prompt),
    not in the `commands/*.ts` modules. Every prompt path checks
    `process.stdin.isTTY` first and throws `NonInteractiveError` (also in
    `USER_FACING_ERRORS`) instead of relying on `@inquirer/prompts`'
    `ExitPromptError` on a closed stdin. The generic prompting pieces
    (`NonInteractiveError`, `pickMenuItem` / `searchChoices`,
    `promptForPositionals`, `promptForOptions`) live in
    `packages/cli/src/ui/`, which has no knowledge of commands;
    `interactive-menu/` holds the rest, one folder per piece:
    `command-registry`, `menu-items`, `run-menu-entries`, `child-argv` and
    `launch-menu`.
    A `CommandEntry` can also declare `options` (spec
    `tech-interactive-menu-options.spec.md`, #1052) so its yargs options are
    offered through the menu too, not just required positionals — required
    options are always prompted like positionals; everything else goes
    through one `checkbox()` ("set any options?") and only the picked ones
    are then prompted, in declaration order, honouring each option's `when`
    predicate over answers collected so far. A `secret: true` option is
    delivered to the spawned child through its env
    (`HOLOCRON_<KEY_IN_SCREAMING_SNAKE_CASE>`), never argv — `ps` and shell
    history both expose a child's argv, never its env.
    For a command whose options have a real either/or relationship instead
    of independent flags — `package publish`'s steady-state publish /
    `--initial` bootstrap / `--sync-trust` maintenance mode, which `when`
    alone could only approximate by silently dropping a contingent pick
    after the fact — declare `modes` instead of `options`: the user picks
    one workflow first ("What would you like to do?"), and only that
    mode's own options are ever shown, so nothing contingent on a different
    mode is ever offered in the first place. `package publish` is the
    first (and, so far, only) command that needs `modes`; every other
    command with options declares plain `options`. `promptForOptions`
    returns a `ResolvedOptions` (`{ options, answers, deferred }`) either
    way — `buildChildArgv`/`secretEnv` render both shapes identically,
    with no need to know which kind of command produced it. An option
    marked `askLast: true` (e.g. `package publish`'s `--otp`) is left out
    of `answers` and listed in `deferred` instead — its value isn't
    collected until `promptForDeferredOptions` is called right before the
    real (non-dry-run) spawn, never any earlier: a dry-run preview and a
    human confirming "proceed with the real run?" can both take a while,
    and a time-sensitive secret (a TOTP code) typed before either risks
    going stale before it's actually used — and a dry run never reaches
    the real npm call that would need it anyway. `required` and
    `askLast` compose independently: `required` only decides whether an
    option sits behind the checkbox (always included vs. opt-in);
    `askLast` only decides when its value is collected (upfront vs.
    deferred). `package publish`'s `--otp` is `askLast: true` always,
    and its `required` is computed once at module load from
    `HOLOCRON_NPM_ENFORCE_2FA` — an operator whose own npm account always
    enforces 2FA sets that env var in their own shell profile (never
    committed) to stop re-checking the OTP checkbox every run, without
    forcing an OTP prompt on anyone else publishing from the same repo;
    it's still collected last either way. Every other command's
    options are still rolled out one PR per command group, tracked on
    #1052 — a command's own yargs options not yet triaged into
    `options`/`skipOptions`/`modes` is a known, accepted gap until that
    command's turn, not a bug.

## Consuming packages from `theholocron/clients`

When a plugin or the CLI gains a dependency on a `@theholocron/*`
package published from the clients repo:

1. **Add to catalog** in `pnpm-workspace.yaml` under `catalog:`, e.g.:
   ```yaml
   "@theholocron/github-client": ^0.3.2
   ```
2. **Reference via `catalog:`** in the consuming `package.json`
   instead of hardcoding a version.
3. **The `overrides:` block** in `pnpm-workspace.yaml` already forces
   `@theholocron/http-client` to a single version. Any new clients
   package that transitively depends on `http-client` is covered
   automatically — no extra override needed unless the new client
   introduces a different shared dep that could split.

**Why overrides matter:** `@theholocron/github-client` and
`@theholocron/cli` both depend on `@theholocron/http-client`. Without
the override, pnpm can resolve them to different versions, creating two
separate module instances. `instanceof ProviderApiError` then silently
returns `false` — the same class from different instances is never
equal. The `overrides:` block in `pnpm-workspace.yaml` collapses all
resolutions to one version.

**`ProviderApiError.details` is a raw string**, not parsed JSON.
When checking error body content use `String(err.details).includes(...)`,
not object destructuring.

## Code patterns

- **Package manager: pnpm only.** Never use `npm` or `yarn`. Run workspace-wide tasks through Turbo (`pnpm test`, `pnpm build`, etc.); run single-package tasks with `pnpm --filter <name> <script>`.
- **No `any` in TypeScript.** Use `unknown` for values of genuinely unknown shape and narrow with type guards. Use generics instead of `any` in function signatures. `as never` and `as unknown as T` are acceptable for internal casts where the type system can't follow; `any` is not.
- **One function per file, types in `*.type.ts`.** In `packages/*` (`cli`,
  `astromech`, `datapad`, and `apps/sentinel`), exported
  `interface` / `type` declarations live in `<name>.type.ts`, not in the
  implementation file. A module sits in a folder named after it, holding the
  implementation, its test and, when it declares types, the type file
  (`commands/auth/auth.ts`, `auth.type.ts`, `auth.test.ts`). Types shared by
  several functions in one folder stay in that folder's own `*.type.ts`
  (`commands/publish/publish.type.ts`). Each such folder has an `index.ts`
  barrel that re-exports the implementation and the types
  (`export * from "./auth.js"; export type * from "./auth.type.js";`), and code
  outside the folder imports through it (`../commands/auth/index.js`); files
  inside the folder import their siblings directly. The `auth/`, `config/`,
  `plugin/` and `ui/` directories also have a root `index.ts` that re-exports
  their folders, and code outside the directory imports through it
  (`../ui/index.js`). `config/` and `plugin/` import each other, so between
  those two the specific folder barrels are used; going through both root
  barrels would create a runtime import cycle. `src/index.ts` keeps its own
  curated exports and does not use the root barrels. Modules with no types
  still get their own folder (implementation, test, `index.ts`) so a directory is
  consistently folders; no empty `*.type.ts`. In `astromech`, `config/` and
  `lint/` keep their curated public `index.ts` (the `./config` and `./lint`
  subpath exports), `tasks/run/index.ts` stays curated too, and
  `templates/` keeps its one-folder-per-generator layout beside the template
  data files that the build turns into strings.
- **No third-party observability / telemetry SDK is imported in this repo.**
  `pino`, `@sentry/node`, `posthog-node` live behind
  `@theholocron/observability` — the `Logger` / `ErrorSink` / `AnalyticsSink`
  interfaces (with `Noop*` for the opted-out / no-credentials path) come from
  `@theholocron/observability/core`; the `PinoLogger` / `SentrySink` /
  `PostHogSink` adapters — the sole vendor call sites — from
  `/logger`, `/errors`, `/analytics`. `git grep -nE "@sentry/node|posthog-node|
from \"pino\"" packages/` must return **nothing** (source). The CLI's
  `observability/telemetry.ts` holds only orchestration +
  `observability/resolve-telemetry.ts` (the Holocron-specific DSN / key
  resolution, which stays here). A vendor swap or a
  test fake is one file — in `theholocron/observability`.
- **Adapter pattern for new vendors.** New plugins use the
  `/holocron-skill-plugin` skill at `.claude/skills/holocron-skill-plugin/`. The
  skill produces ~14 files in the right shape; only the capability
  method bodies need to be filled in (REST calls / shell-outs).
- **REST clients (`rest.ts`):** bearer auth + `accept: application/json`
  headers, transport-failure wrapping (`ProviderApiError` with
  `status: 0` for `TypeError: fetch failed` etc.). Always returns
  `undefined` on 204 or when `expectNoContent: true`.
- **CLI-transport clients (`shell.ts`):** `spawnSync` wrapper with
  `stdio: ['inherit', 'pipe', 'pipe']` (the inherit stdin matters —
  it gives the vendor CLI a TTY signal so biometric / interactive
  prompts work locally; CI sees no TTY and behaves accordingly).
- **Soft-skip over hard-fail when a capability fails.** Orchestrator
  commands (`setup`, `secrets sync`, `doctor`) wrap each step in
  `try/catch` and continue; final summary reports `ok / fail / skip`
  counts. Per-step failure does not abort the run.
- **Idempotent capability operations.** Probe-then-act, treat
  "already exists" / 409 / EPRECONDITION as success, never break
  on re-runs.
- **`holocron.config.json` is the contract.** No hardcoded vendor
  lists, no hardcoded paths, no implicit assumptions. Config drives
  loader; loader drives commands.

## Workflow

- **Discuss → `.notes/<topic>.spec.md` → GitHub issue.** Non-trivial
  decisions get a spec file in `.notes/` before acting. Lifecycle:
  `draft → proposed → accepted → archived` (or `superseded`). Spec name
  prefixes: `tech-` / `tool-` / `process-` / `ci-` / `security-`.
  Once the design is settled the spec **moves to
  `docs/wiki/specifications/`** (`accepted` for living reference docs,
  `archived`/`superseded` for shipped or dropped work); `.notes/` holds
  only in-progress specs. `scripts/validate-adrs.mjs` checks both dirs.
- **File issues for non-trivial work** and reference in commits/PRs
  (`Closes #N` / `Refs #N`). Cross-check against `.notes/*.spec.md`
  before starting; several already have design docs. Skip for typo fixes.

## Quality

- **Definition of done: code + tests + docs + green checks.** A change
  is not done until all four are true:
  1. `holocron run ci` passes — it runs exactly the merge-gating checks, in
     CI order, one non-zero exit on the first failure. (Equivalent:
     `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — the same
     set CI runs. Finding failures after pushing wastes a round trip.)
  2. Tests cover the new behavior (new path → new test; bug fix → test
     that would have caught it).
  3. Docs are updated: `packages/cli/README.md` for any public API or
     config shape change; `AGENTS.md` for any architectural or workflow
     change; the relevant `.notes/*.spec.md` spec for any design
     decision or roadmap item resolved. Stale docs that contradict the
     code are bugs.
  4. Commit message follows Conventional Commits and references the
     issue (`Closes #N` / `Refs #N`).
- **Test patterns:** vitest across all packages. REST plugins import
  `stubFetch` from `@theholocron/http-client/testing` (published,
  originally ported from rando-id/rando.id `__tests__/helpers.ts` —
  every package hand-copied its own until this shared subpath replaced
  them). CLI-transport plugins (currently only `holocron-plugin-1password`)
  use their own local `stubSpawn` — no shared equivalent exists yet, it's
  a one-off. Per-plugin coverage floor: 90%+ lines on the auth +
  REST/shell + capability surface.
- **Don't call `expect(...).toThrow()` twice on the same stubbed call.**
  The stub queue advances per call; second invocation gets the default
  empty response. For multi-property error checks use the `.catch` capture
  pattern instead — it avoids both the double-call and `vitest/no-conditional-expect`:

  ```ts
  // async
  const err = await fn().catch((e: unknown) => e);
  expect(err).toBeInstanceOf(SomeError);
  expect((err as SomeError).message).toMatch(/pattern/);

  // sync
  const err = (() => {
    try {
      fn();
    } catch (e) {
      return e;
    }
  })();
  expect(err).toBeInstanceOf(SomeError);
  ```

- **Discriminated union results** (`{ ok: true; subject } | { ok: false; message }`):
  assert the branch with `expect(result.ok).toBe(true)` then access the
  narrowed field via a cast — never use `if (result.ok)` with `expect`
  inside, as `vitest/no-conditional-expect` correctly flags that:
  ```ts
  expect(result.ok).toBe(true);
  expect((result as { ok: boolean; subject?: string }).subject).toMatch(/pattern/);
  ```
- **`holocron repo upgrade node` pattern registry.** When you introduce a
  new file type that pins the Node.js version (e.g., a new CI platform's
  config, an `.engines` file, a custom script), add a `Pattern` entry to
  the `PATTERNS` array in
  `packages/cli/src/commands/upgrade-node/upgrade-node.ts` — a `matches` predicate
  on the filename and a `patch` function that replaces the old major with
  the new one. The `upgrade.node.extra` field in `holocron.config.json`
  is only for non-conventional _file paths_ (unusual locations for known
  file types); it is not a substitute for adding a new pattern.
- **PR checks must be green before merge.** `pnpm typecheck`,
  `pnpm lint`, `pnpm test`, `pnpm build` all run on `ci.yml`. Run
  `holocron run ci` as the local pre-flight (a `pre-push` hook runs it
  automatically in `protection: "strict"` repos; `git push --no-verify`
  bypasses one push). CodeQL runs separately. DCO checks the Signed-off-by
  trailer per commit (use `-s`). Don't merge through red checks.

## Releases (automated)

- **Two release branches.** `main` is the **stable-release branch**
  (publishes to npm's `latest` dist-tag); `alpha` is the
  **prerelease branch** (publishes to the `alpha` dist-tag). All v2
  alpha work happens on `alpha`; merge `alpha → main` only when
  cutting a stable release. A `feat`/`fix`/`refactor`/`perf` landing
  directly on main will publish stable, so keep those PRs targeted at
  `alpha`. Docs, chore, ci, test are safe on either.
- **semantic-release on push to main or alpha.** Walks Conventional
  Commits since the last tag on the branch's channel, computes the
  next version, bumps all 9 public packages in lockstep via
  `scripts/bump-versions.mjs`, publishes via OIDC, creates a GitHub
  Release, commits `CHANGELOG.md`.
- **npm Trusted Publishing.** OIDC token exchange at publish time —
  no `NPM_TOKEN` secret anywhere. Each package has a Trusted
  Publisher registered on npmjs.com (Publisher: GitHub Actions,
  Repo: theholocron/holocron, Workflow: release.yml).
- **First publish for a new package** uses `holocron package publish --initial`
  (chicken-and-egg: trusted publishing needs the package to exist
  first). The command runs `npm login --auth-type=web` itself when
  `npm whoami` shows no session. Workflow: `pnpm install && pnpm build`
  → `pnpm exec tsx packages/cli/src/cli.ts package publish --initial --otp <code>`.
  Self-narrowing: it checks every publicly publishable package against the
  npm registry (existence, not version) and only targets the ones that
  don't exist on npm yet — re-running it after adding one new package to an
  already-bootstrapped monorepo only publishes that one, not all of them
  again. Nothing new to bootstrap is a success, not a failure.

## Repo layout

<!-- prettier-ignore -->
```text
packages/                         — core infrastructure (the CLI and its runtime)
  cli/                            — @theholocron/cli                       (binary + runtime + 18 capability interfaces)
  astromech/                      — @theholocron/astromech                 (task runner: holocron run / ci, thin callers, package scripts, linters, required checks, reusable workflows — ADR-0009, epic #581)
  datapad/                        — @theholocron/datapad                   (generic holocron.config loader — ADR-0010)
apps/                             — deployable applications (not published to npm)
  sentinel/                       — @theholocron/sentinel                  (minimal GitHub App — webhook receiver, scaffolding only, docs/wiki/specifications/tech-sentinel-v1.spec.md)
plugins/                          — vendor capability providers, one package per provider (split from packages/ as the count grew)
  holocron-plugin-github/         — source / ci / secrets / environments / issues
  holocron-plugin-vercel/         — deployment
  holocron-plugin-netlify/        — deployment
  holocron-plugin-neon/           — storage
  holocron-plugin-clerk/          — auth (+ parseWebhook utility)
  holocron-plugin-cloudflare/     — dns
  holocron-plugin-1password/      — vault (CLI shell-out — only non-REST plugin)
  holocron-plugin-doppler/        — vault (REST)
  holocron-plugin-infisical/      — vault (REST)
  holocron-plugin-discord/        — notifications
  holocron-plugin-slack/          — notifications
  holocron-plugin-axiom/          — logs (REST)
  holocron-plugin-fern/           — wiki
  holocron-plugin-postman/        — tooling
  holocron-plugin-posthog/        — analytics
  holocron-plugin-sentry/         — errors
  holocron-plugin-checkly/        — monitoring (REST)
holocron.config.ts                — this repo's own config (self-hosted)
.notes/                           — in-progress design specs (settled ones move to docs/wiki/specifications/)
.claude/skills/holocron-skill-plugin/ — scaffolding skill for new plugins
.github/workflows/                — ci.yml (PR), release.yml (main), codeql.yml, etc.
scripts/bump-versions.mjs         — lockstep version bump invoked by semantic-release

```

## Backlog

Scheduled-but-not-started work lives on the **[`v4.0` milestone](https://github.com/theholocron/holocron/milestone/3)**
as tracking issues — DO NOT build them speculatively; pick up an issue when
ready. Several have a design doc in `docs/wiki/specifications/` (status
`proposed` there, or `.notes/` while still being drafted) — cross-check
before starting.

In-progress specs (`draft` / `proposed`) sit in `.notes/`; once settled they
move to `docs/wiki/specifications/`. The entire v2-alpha issue backlog
(#74–#96) shipped; the specs that drove it are archived there for reference.
