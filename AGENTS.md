<!-- editorconfig-checker-disable-file -->

# theholocron/holocron — agent operating contract

`CLAUDE.md` is a symlink to this file, so Claude, Codex, and every other agent
read the same rules. Put durable, repo-wide agent guidance here.

@.agents/org.md

## Where code lives (org-wide rule)

One rule per concern (the shared-code groups are folders in this monorepo, formerly separate repos):

- **Shareable tool config (ESLint, Prettier, TSConfig, Vitest, …)** → `configs/`. If you find yourself copy-pasting a tool config across repos, it belongs there as a `@theholocron/*-config` package.
- **HTTP clients and API wrappers** → `clients/`. REST clients for third-party services and shared HTTP primitives live there.
- **Generic, dependency-light helpers (path walking, git remote parsing, JSON formatting, …)** → `utils/` as a `@theholocron/*-utils` package, consumed here as workspace packages (`workspace:^`). If the same helper is written twice in this repo, it belongs there.
- **Anything that can be automated** → `theholocron/holocron` (this repo). Infrastructure commands (`setup`, `upgrade`, `doctor`, `secrets sync`), CI orchestration, and repo lifecycle automation belong here in the Holocron CLI.
- **`holocron.config` format** — use `holocron.config.ts` with `defineConfig` in any repo that has a `package.json` (the CLI must be resolvable at runtime). Use `holocron.config.json` in content-only repos with no Node.js infrastructure (e.g., `.github`, `.github-private`).

## Architecture

- **Capability/provider model.** 20 capabilities defined in
  `cli/cli/src/plugin/capabilities/capabilities.type.ts`. Vendors implement N
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
  config repo, read and written with its own `github.user-sync` token. The sync is one function, `syncRoles()` (with `readLinks`, `roleTeamProblem`, `sourceProblem`), exported from `@theholocron/cli`: `notifications sync-roles` and Sentinel's role sync (`apps/sentinel/src/actions/role-sync/`, #1595, spec `tech-sentinel-role-sync`) are two adapters over it. Sentinel runs it on `membership` (team) and `organization.member_removed` deliveries, only when `SENTINEL_ROLE_SYNC_REPO`, `HOLOCRON_DISCORD_BOT_TOKEN` and `HOLOCRON_USER_SYNC_TOKEN` are set. The
  capability methods behind it are optional on `Source` and `Notifications`. A server can also be created from the layout (`notifications create-server`): the bot makes it and applies the layout as owner, writes the new id into the config, invites a person and hands the server over; the doctor fails while the bot still owns it.
  A pinned message can take its text from a file in the repo (`pinned: [{ channel, file }]`, `RULES.md` for `#rules`, #1533): the CLI reads the file (`resolvePinnedFiles()`) before it calls the provider, so a provider only sees `content`; the file wins over a hand edit and `doctor notifications` reports the drift (spec `tech-discord-channel-content`).
  The runs nobody watches reach Discord through one hand-maintained workflow, `platform.notifications.yml` (#1159): a run that errors on `alpha`/`main` posts to #alerts with the gatekeepers ping (to #deploys for a deploy), a deploy, preview or Preview Check that succeeds posts to #deploys on any branch (deliberately noisy, #1578), and a release posts the tags it made to #releases. A failed-run post names the failing jobs of the run, with links (five at most, `actions: read` on that one job, #1614). It triggers on `workflow_run` of the caller workflows, so it sees the caller's name, which is its task id (`release`, `test:unit`; #1620), and tells a release or a deploy apart by its file (`workflow_run.path`, `ci.release.yml`); a release's tags are read from git, because a package line is tagged without a GitHub release. `doctor notifications` checks that the file is on the default branch, that the `HOLOCRON_NOTIFY_*` secrets it reads are the ones the layout fills and that the workflows it lists are task ids and not the old group names (`notificationsWorkflowChecks`, #1581, `workflowNameProblems`, #1620).
  `doctor notifications --post [channel]` shares a drift check you ran yourself (#1585): the bot posts the failing steps, or only the summary line when none failed, through the optional `Notifications.postMessage`; the provider tokens it reads with stay local. A weekly `platform.doctorReminder.yml` post reminds a maintainer to run it.
  An error tracker's alerts reach a channel through the Comlink relay Worker (`apps/comlink`): `Errors.ensureRelay` (optional) makes the tracker's integration and alert rule and returns its signing secret, which `notifications setup` hands to the Worker in the same deploy (`relay.errors` in the layout). The secret is never printed, setup never deletes, and the tracker gets its own token (`sentry.comlink`).
- **Credentials** (`credentials` capability, #1606). Where this machine reads its own tokens, ahead of the keyring: a provider that needs no token of its own (1Password, through `op`) returns the variables of the environment named by its own `environment` option in `providers.credentials` (`credentials: ["1password", { environment: "Holocron" }]`) or, for a provider with none, by the shared `credentials.environment` (`credentialsEnvironment()` picks it). The CLI passes the name to `read`, so the plugin never stores it. `PluginLoader.load()` loads the `credentials` providers first and reads each into the in-process credential store (`auth/credential-store`) once, and the token resolvers (`createResolveToken`, `createFeatureResolver`) look a token up there after the flag and the process environment and before the keyring. A provider that fails to load or read is recorded and skipped. The repo's own `<repoRoot>/.env` is read the same way, first (`auth/dotenv-file`, through `PluginLoader.load()`), so the chain is flag, process environment, `.env`, `credentials` providers, keyring; it is optional, needs no config and is never read from the working directory. (Importing `@theholocron/env-utils` still loads a `.env` from the working directory into `process.env` through `dotenv/config`; that side effect predates the explicit step.) `holocron doctor credentials` (a `DEEP_CHECKS` entry) compares the environment with the tokens the configured plugins list, through the optional `Credentials.inspect`, which returns names and never values; its loader is built with `readCredentials: false`, so the providers are not asked for a value at all. `holocron auth export` (`commands/auth-export`) writes the keyring's tokens as `NAME=value` for the plugins' `tokens` to a private, git-ignored, never-overwritten `.credentials` (mode 0600) that it deletes once the 1Password import is done, or to stdout when that is a pipe, or to the clipboard (`clipboardy`) on `--copy`, never to a terminal or a redirected file (`stdoutKind`), to fill an environment the CLI cannot write to. It is separate from `vault`, the source of truth `secrets sync` fans out from. `secrets sync <environment>` follows `repo.secrets.sync` (each entry's `keys` to its `scope`, one step per scope; `--github-secret` overrides, #1702) and skips a value that is blank in the vault in every destination, so a placeholder never overwrites a working secret. The wait-for-the-import-then-delete step is `finishCredentialsFile()`, shared with `holocron github-app create` (#1674), which makes a GitHub App from a manifest (GitHub's manifest flow: a one-shot loopback server, the code exchanged once) and writes its id, key and webhook secret the same way.
- **Probes** (`holocron probe <provider> <probe>`, epic #1166). A plugin may return `probes` from `createPlugin` next to
  `capabilities`: named, on-demand pokes at a live provider (inspect, or prove something end to end). They run under
  `runProbe`: output is scrubbed of secrets, a change goes through `ctx.write` (skipped on `--dry-run`, refused for a probe
  without `writes: true`), a writer is asked about first (`--yes` without a terminal), and what it registers with
  `ctx.cleanup` is undone on success, failure and Ctrl-C. `doctor` compares the config with reality; a probe has no layout.
  The `docs` probes measure doc-comment coverage of the public API (`docs coverage`, `docs patch`, `docs lcov`), which is every
  entry in a package's `exports`, subpaths included (`subpath-entries.ts` maps each to its source); `--lcov <path>`
  on the first two also writes the lcov report, which the Docs coverage workflow uploads to Codecov as the `documentation`
  flag (spec `tech-api-docs`, epic #1368). `repoValidation.docsCoverage` (`off` default, `warn`, `required`) in
  `holocron.config.ts` decides what `docs patch` does about a miss and whether `repo setup` writes the flag's statuses.
  `docs presence` is the `validate:docs` task: it warns (never fails) when a new public
  package, or a `feat` to one, ships with no docs change, and `[skip docs] <reason>` in the PR description or a commit
  message excuses it (#1515). Its rules are pure functions in `@theholocron/astromech/repo-validation` (#929); the probe
  only supplies them with git data, and Sentinel is meant to supply the same rules from the GitHub API. A registry task can be a holocron subcommand (`local: { command }`).
  `specs check [files...]` is the `validate:specs` task (#929): it fails for each ADR (`docs/wiki/decisions`)
  or spec (`.notes`, `docs/wiki/specifications`) whose frontmatter is wrong and reports a warning as an `info` row. The rules
  are `checkSpecs()` in `@theholocron/astromech/repo-validation`; the probe reads the files through an injected `SpecsIo`,
  and Sentinel's `validate-adrs` action fetches a PR's changed files and passes their text to the same function.
  `tasks names` (#1618, spec SPEC-0064) lists the hand-written places (workflows, scripts, docs, `turbo.json`, `package.json`, configs, hooks) that still use an old dotted task name, with file, line and the flat id to use; failures (exit 1), or `info` rows with `--warn`; `--files` adds workflow file names, which are skipped by default. It reads astromech's `LEGACY_NAMES` (`legacyReplacements()`), also finds a bare old name used as a task and a reserved script name, and an intentional mention carries `holocron-allow-old-name`. `doctor repo` compares the ruleset's required contexts with `requiredChecks()` (`compareRequiredContexts`): `missing required check` and `stale context` rows.
  `specs sync` numbers each spec (`id: SPEC-0007`; ADRs have `ADR-0009`) and keeps a forum post per ADR and spec (titled
  with the document's own title, tagged with its status) in step with the files
  (#1535, spec `tech-specs-discussion-threads`): it finds or makes each post through optional `Notifications` methods
  (`ensureDiscussion`, `readDiscussion`, `updateDiscussion`), writes `discussion.url` and, when a gatekeeper retagged a
  post, the file's `status:` into the working tree only (the workflow commits it to a pull request), and decides by
  `reconcileSpecStatus()` over the file's, the tag's and the last-synced status. `--refresh-origin` and `--refresh-titles` (#1654, #1657) are
  opt-in repairs that patch one field of existing posts (the `PR:` line, the title); `--refresh` (#1658) runs both and the id
  repair in one pass. The id opening a post's first message is a link to the file on the default branch
  (`discussionIdLine()`, `repo.defaultBranch`, else `HEAD`) once the file is there, and plain text while `--pr` names an
  open pull request. The normal sync (the hourly `Spec discussions` run) rewrites a post's id line whenever it is not what
  `discussionIdLine()` gives and the run has no `--pr` (#1663): a file followed to a new path, a post made while its pull
  request was open. It compares `DiscussionPost.idLine`, which comes with the post, so a run where every post is right
  adds no request, and writes through `DiscussionPatch.idLine` (only the first line of the message); `--refresh` does the
  same for any run and also takes a link off. A Discord rate limit (429) stops a run
  cleanly (`rateLimited` in the report, `left` documents) and the next run continues. `--files` limits a run to the given
  paths and `--pr` names a pull request on the posts: `knowledge.specsOnPullRequest.yml` uses both to post while a
  same-repository pull request is still open (#1600), and throws the edits away; the post is linked after the merge.
  `--refresh-origin` (#1652) is an opt-in repair, never a standing behaviour: it compares each post's `PR:` line
  (`DiscussionPost.prLine`) with `discussionPrLine()` and passes `DiscussionPatch.prLine` to `updateDiscussion`, which
  swaps only that paragraph of the bot's first message and leaves the synced footer, tag, title and closed state alone.
  `--withdraw --files <paths>` (#1653) tags the post of a spec or ADR `withdrawn` and closes it, for a pull request closed
  unmerged (the same workflow on `closed` with `merged == false`, same-repo only, CLI built from the BASE branch so the bot
  token never runs a closed pull request's code). `withdrawn` (`WITHDRAWN_STATE`) is a tag and a closed post only: never a
  file status, and `reconcileSpecStatus()` treats it as no tag (`set-tag`, never `request`), so a sync pull request cannot
  write `status: withdrawn` and a reopened pull request restores the post.
- **Tunnels** (`tunnels` capability, #1678). A named tunnel with a stable public hostname to a port on this machine, for a webhook that has to find a development instance. `Tunnels.ensureTunnel()` finds the tunnel by name or makes it and makes it serve a hostname (other hostnames' rules kept, the `http_status:404` catch-all last, nothing rewritten when it is already right); `tunnelToken()` is a credential and is never printed. `holocron tunnel up` (`commands/tunnel-up`) puts it together with the `dns` provider (a proxied `CNAME` to `<id>.cfargotunnel.com`) and, with `--run`, starts `cloudflared` in the foreground with the token in `TUNNEL_TOKEN`, never argv (`runCloudflared()`). `holocron dev` (`commands/dev`) is the same with the application, configured by the `dev` block of `holocron.config` (`DevConfig`: environment, tunnel name and hostname, port, command; flags win, `resolveDevOptions()`): it reads a vault environment's variables in memory, sets up the tunnel through `runTunnelUp()`, and runs the application beside `cloudflared` (`runDevProcesses()`: the app gets the variables and `PORT`, the connector gets `TUNNEL_TOKEN`; Ctrl-C stops both and is not a failure). The application is `dev.command`, or, for a web-standard handler, `dev.serve` (`DevServeConfig`: `handler`, `export`, `required`, `logging`): `resolveDevOptions()` then makes it `holocron dev serve` (`commands/dev-serve`, #1718), which loads the handler with `tsx` after the vault's variables are in `process.env` and serves it on `PORT` through `@theholocron/dagobah`. Values and the token are never printed or written.
- **Doctor** (`holocron doctor`, epic #1162, spec `tech-doctor-deep-checks`). `doctor` is the shallow smoke check;
  `doctor <capability>` is a deep, read-only comparison of what the config declares with what exists, one row per
  step, non-zero exit on a failure. Every deep check is an entry in `DEEP_CHECKS`
  (`cli/cli/src/commands/deep-checks/`) and prints through the shared pieces in `doctor-checks/` (`printCheckRows`,
  `printCheckSummary`, `declaredVsActual`), so a new one is a list of comparisons, not a renderer. A new entry also
  needs `COMMAND_CONTEXTS` and `COMMAND_REGISTRY` entries; `deep-checks.test.ts` fails without them. Checks that write
  and read back are probes, not doctor. `doctor ci` (#1689) needs no provider: it checks the repo against the flat task
  vocabulary (deprecated aliases in `tasks:`, caller file/workflow/job names, the `ci` aggregate's `expected`, the
  callers' home), reading `.github/workflows` through an injected `CiIo`; the ruleset stays `doctor repo`'s.
- **Plugin packages** are named `@theholocron/holocron-plugin-<provider>`.
  Each follows the proven template: `auth.ts` + `rest.ts` (or `shell.ts`
  for CLI-transport) + `capabilities/<key>.ts` + `index.ts` exporting
  `createPlugin()`.
- **Task manifest → `@theholocron/astromech`** (ADR-0009, epic #581). One
  `tasks` array in `holocron.config` drives every workflow surface:
  `holocron run` / `holocron run ci`, each repo's `.github/workflows/*.yml`
  thin callers (`astromech.thinCallers()`, consumed by `holocron repo sync` /
  `holocron repo setup`), `package.json` scripts, the linter set, the
  branch-protection required checks (in holocron: `ci / Required checks` and `DCO`, #1613), and the reusable `workflow_call`
  implementations pushed to `theholocron/.github`
  (`astromech.reusableTemplates()`, consumed by `holocron sync github`; their
  source files are in `ci/`, the `@theholocron/ci` package).
  The sources are grouped by suite: `ci/workflows/<suite>/<leaf>.yml`, or `ci/workflows/<id>.yml` for a leaf in no suite.
  `idFromSource()` (path to task id: `test/unit.yml` is `test:unit`) and `workflowFile()` (id to the flat generated
  file: `test-unit.yml`) are the only place that mapping lives, exported from `@theholocron/ci` and `@theholocron/astromech`
  (spec `ci-flat-task-vocabulary`, #1619). The reusables a repo hosts are written to `.github/workflows` under the flat
  names; the frozen copies in `theholocron/.github` keep the old ones, so a caller of another repo is written with
  `legacyFile()` (and `localize` goes back with `flatFile()`) until `CI_HOME` moves to `ci-v1`. The caller files, workflow
  names and check names did not change.
  Root `package.json` scripts and `turbo.json` come from one function, `scriptsFor()` (spec `ci-flat-task-vocabulary`,
  #1616): in a pnpm workspace each script calls turbo directly (`"test": "turbo run test"`, because the `holocron` bin is
  built from this repo and does not exist on a fresh clone), a repo-scoped leaf holds its tool's own command, a suite
  (`test`, `lint`, `scan`) is a script-less aggregator task in `turbo.json`, and a repo-scoped suite leaf is a `//#<id>`
  root task; a single package uses `holocron run <words> --`. A package's leaf script holds the real tool command and never
  calls turbo or `holocron run`, and no package has a script named like a suite or an npm lifecycle word.
  `holocron repo sync` writes the scripts (`syncScripts` is on here) and `holocron probe generated check` fails on a root
  script that differs and on a package script that breaks those rules. Unit tests always run with coverage (the `test:unit`
  command carries `--coverage`; there is no flag). Until a repo rewrites `tasks:` to flat ids, its turbo keys and package
  scripts keep the old dotted names the entries are spelled with (`taskKey()`).
  A thin caller's workflow `name:`, job `name:` and file are the task id (#1620): `test:unit` is `name: test:unit`, the job `test-unit` and, in holocron, the file `ci.test-unit.yml` (the `ci.` prefix keeps it from clashing with the reusable `test-unit.yml` beside it), so its check is `test:unit / Conclusion` and the `ci` aggregate waits for it by the prefix `test:unit / `. Another repo's callers keep the names they had (`verification.unitTests.yml`, `name: Verification`, job `test`) while `CI_HOME` points at the frozen reusables in `theholocron/.github` (`legacyGate()` in astromech, `legacyCaller()` over the `LEGACY_CALLERS` table): its ruleset still lists those checks. Moving `CI_HOME` to `ci-v1` opens the gate and drops the table.
  The loop closes both ways: the reusable workflows (`typecheck`, `test-unit`, `lint-code`, …) run
  their core step through the `holocron` composite action
  (`holocron run <task> [job]`), so CI executes the same command a
  contributor runs locally.
  A `deploy` task with `with: { on: "release" }` in a workspace
  package's `holocron.config` is a release-time deploy (#930): the shared
  `release` workflow's separate `deploy` job runs `holocron
deploy-on-release` (`deployOnRelease()` in astromech) after the release job,
  and it generates no workflow of its own.
  The workflows read a few organization Actions variables (`vars.TURBO_TEAM`, `vars.CLOUDFLARE_ACCOUNT_ID`, …). They
  are declared in `holocron.config.ts` under `repo.variables` and written by `holocron repo setup`, never set by hand. A
  missing one fails quietly, so the templates warn and say where it is declared: the shared `setup` composite action
  when `TURBO_TOKEN` is set without `TURBO_TEAM`, and `preview.yml` (deploy and cleanup) when a Pages project is
  configured without `CLOUDFLARE_ACCOUNT_ID`. Account-specific values deliberately have no default in the templates.
  **`theholocron/.github` and `.github-private` are pure sync targets** —
  their `.github/workflows/*`, `.github/actions/*` and `workflow-templates/*`
  are generated from `cli/astromech/src/templates/` and pushed by
  `holocron sync github`; edit the source here, never those repos directly.
- **The `ci` aggregate check** (#1613, spec `ci-flat-task-vocabulary`, epic #1612). One stable required check: the
  reusable `ci/workflows/ci.yml` has one job, `Required checks` (called from the caller job `ci`, so the context is `ci / Required checks`), that polls the Checks API for the PR's head commit until every
  `expected` id has a check run named `<id> / ...` and has completed, and every `statuses` entry (the `codecov/`
  extras) reached `success`, or 30 minutes pass; an id that never posted fails. `aggregateChecks()` derives both
  inputs from the same list the ruleset used to take (`required: true` tasks, then `extraRequiredChecks`, using
  the names the checks post) and `aggregateCaller()` renders the thin caller, written as `ci.ci.yml` only in the repo that hosts
  the reusables. The summary lists every expected check with a link, failures first, plus `::error` annotations.
  `requiredChecks(config, aggregate)` is `ci / Required checks` and `DCO` there and the old per-task list elsewhere, so a repo with no
  `ci` caller is never told to require it. A rename or a new workflow no longer touches a ruleset.
- **Flat task ids** (#1615, phase A of epic #1612, spec `ci-flat-task-vocabulary`). The astromech registry (`TASKS`) is
  keyed by flat, verb-first ids: `<verb>`, `<verb>-<object>` or `<suite>:<leaf>` (`typecheck`, `build`, `test:unit`,
  `lint:code`, `deploy-preview`, `release`). A suite (`test`, `lint`, `scan`) is declared by the `suite` field of its leaves,
  never an id; `holocron run test` runs the leaves the repo's `tasks:` lists, in registry order, `holocron run test unit`
  and `test:unit` run one (`resolveWords()`: words joined with `:`, longest match wins, the rest is the `[job]`
  argument). `format` is prettier only: it writes, `--check` (the registry's `checkArgs`) reads, and `holocron run ci`
  runs it read-only. `LEGACY_NAMES` maps every old dotted name to its successors (`sourceQuality.formatting` to <!-- holocron-allow-old-name -->
  `lint:editorconfig`, `lint:markdown` and `format --check`); `holocron run`, `tasks:` and the manifest consumers
  (`isTask()`, `resolveTaskName()`) accept both and the runner prints a deprecation notice on stderr. A manifest spelled with
  either name generates the same files, reached through `workflowKey()` / `legacyName()` (`probe generated check`
  proves it). Phase A changed no generated file; the later phases moved the thin callers, workflow names and check
  contexts to the flat ids, as described above. `validate` is a suite of two probe tasks, `validate:specs`
  (`probe specs check`) and `validate:docs` (`probe docs presence`), each with its own reusable workflow, caller and
  check (`validate:specs / Validate ADRs and specs`, `validate:docs / Validate docs presence`), and a third,
  package-scoped leaf with no workflow, `validate:plugin` (the plugins' own script). The sub-job mechanism (`jobs:`,
  `retiredJobs`, the `Conclusion` aggregator) is gone (#1622). `validate` and `platform.repoValidation` in a `tasks:` list <!-- holocron-allow-old-name -->
  are aliases for both leaves (`workflowKeys()` writes one caller each; a repo still on the legacy gate gets the one
  `platform.repoValidation.yml` caller, which the frozen reusable answers for both). `RESERVED_SCRIPT_NAMES`
  and `PNPM_BUILTIN_COMMANDS` list the npm lifecycle words no task may take and the pnpm built-ins that need
  `pnpm run <script>`.
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
  - **Execution context** (`cli/cli/src/commands/contexts/contexts.ts`,
    spec `tech-cli-execution-contexts`, #576). Every command is tagged
    `global` (binary only), `repo-aware` (`./holocron.config`, no
    plugins) or `workspace` (plugin packages resolvable). New commands
    MUST get a `COMMAND_CONTEXTS` entry — `contexts.test.ts` fails
    otherwise. A `workspace` command calls
    `assertPluginsResolvable(loader, name)` right after `loader.load()`;
    it throws `WorkspaceContextError` (printed cleanly by `cli.ts`'s
    `USER_FACING_ERRORS` catch) only when every provider errored with a
    missing-package error — the global-install case.
  - **Interactive fallback** (`cli/cli/src/interactive-menu/`, spec
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
    `cli/cli/src/ui/`, which has no knowledge of commands;
    `interactive-menu/` holds the rest, one folder per piece:
    `command-registry`, `menu-items`, `run-menu-entries`, `child-argv` and
    `launch-menu`.
    A `CommandEntry` can also declare `options` (spec
    `tech-interactive-menu-options.spec.md`, #1052) so its yargs options are
    offered through the menu too, not only required positionals — required
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

## Dependencies and catalogs

Every third-party dependency version lives in a catalog in `pnpm-workspace.yaml`,
so that one file shows what the repo uses. A manifest's `dependencies`,
`devDependencies` and `optionalDependencies` never carry a version of their own:

- used by **two or more groups** (a top-level folder: `cli`, `clients`,
  `configs`, `plugins`, ...) → the default `catalog:`
- used by **one group** → that group's named catalog, e.g. `catalog:configs`
- **`peerDependencies` stay out of catalogs.** A peer range is a compatibility
  range for consumers, and `catalog:` would publish one pinned version in its
  place.
- Our own packages in this repo are always `workspace:^`, never a catalog (the
  CLI and the plugins' peer on it is `workspace:*`). The one catalog of our
  own packages is `peers`: the minimum client and util versions the plugins
  accept as peers. A package that is not in this repo, such as
  `vitest`, is an ordinary dependency in its group's catalog.
- **Dependabot does not bump the `peers` floors.** It reads every catalog entry
  as a dependency, so `holocron repo setup` writes a name-only `ignore` entry
  (`.github/dependabot.yml`, never edited by hand) for each workspace package
  that a catalog lists. Security updates are not affected. To raise a floor,
  edit its line in `pnpm-workspace.yaml` by hand, in the PR that needs the newer
  version, then run `pnpm install`.

`holocron probe deps report` (`pnpm deps`) prints every dependency with its
range and how widely it is used; `holocron probe deps who <name>` lists the
packages that use a dependency, by group; `holocron probe deps check`
(`pnpm deps:check`) fails on a hard-coded version, a workspace package pinned
to a version, a dependency in the wrong catalog or an unused catalog entry.
They read the manifests and `pnpm-workspace.yaml` live on each run (nothing is
cached), from the built CLI (`pnpm build` first). Run the check after adding or
moving a dependency; CI runs it on every pull request as the required check
`Dependency catalogs / Check` (`.github/workflows/sourceQuality.dependencyCatalogs.yml`).

## Consuming packages from `clients/`

The `@theholocron/*-client` packages are workspace packages in `clients/*`
(formerly a separate repo, now archived). They release on
their own version line (tags `clients-v*`), and the CLI and plugins depend on
them with `workspace:^`. When a plugin or the CLI gains a dependency on one of
them:

1. **Add it with `workspace:^`** in the consuming `package.json`, e.g.
   `"@theholocron/github-client": "workspace:^"` (as `cli/cli/package.json` and
   `plugins/holocron-plugin-github/package.json` do). A plugin that also lists
   it as a **peer** sets the minimum version it accepts in the `peers` catalog
   (`"@theholocron/github-client": "catalog:peers"`).
2. **Single-instance pins** live in the `overrides:` block of
   `pnpm-workspace.yaml`. `@theholocron/http-client` is no longer pinned there:
   with every consumer on the workspace the lockfile resolves one copy.
   `@sentry/node` and `posthog-node` are pinned exactly because `http-client`
   peers on them. If a bump ever splits `http-client` again, pin it there
   (exactly, no caret).

**Why a single instance matters:** `@theholocron/github-client` and
`@theholocron/cli` both depend on `@theholocron/http-client`. If pnpm resolves
them to different versions (or peer-resolved variants), two separate module
instances exist and `instanceof ProviderApiError` silently returns `false` — the
same class from different instances is never equal. Resolving the clients from
the workspace plus the exact pins above keep resolution to one instance.

**`ProviderApiError.details` is a raw string**, not parsed JSON.
When checking error body content use `String(err.details).includes(...)`,
not object destructuring.

## Code patterns

- **Setting up a clone: `./.humans/setup.sh`** (`doctor` only reports; #1704). `.humans/Brewfile` is the one list of the non-Node tools the repo needs (`cloudflared`, `op`, `gh`, the CI linters); add a tool there, with `# bin: <command>` when the command differs, rather than in a README or an error message alone.
- **Package manager: pnpm only.** Never use `npm` or `yarn`. Run workspace-wide tasks through Turbo (`pnpm test`, `pnpm build`, etc.); run single-package tasks with `pnpm --filter <name> <script>`.
- **No `any` in TypeScript.** Use `unknown` for values of genuinely unknown shape and narrow with type guards. Use generics instead of `any` in function signatures. `as never` and `as unknown as T` are acceptable for internal casts where the type system can't follow; `any` is not.
- **One function per file, types in `*.type.ts`.** In `cli/*` (`cli`,
  `astromech`, `datapad`, `dagobah`, and `apps/sentinel`), exported
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
  `/logger`, `/errors`, `/analytics`. `git grep -nE "from \"(@sentry/node|posthog-node|pino)\"" cli/ plugins/
apps/` must return **nothing** (source). The CLI's
  `observability/telemetry.ts` holds only orchestration +
  `observability/resolve-telemetry.ts` (the Holocron-specific DSN / key
  resolution, which stays here). A vendor swap or a
  test fake is one file — in `observability/`.
- **Read env through `@theholocron/env-utils/lookup`, never the package entry.** The entry also exports `DotenvLoader`, whose
  module runs `import "dotenv/config"` and so loads the working directory's `.env` into `process.env` on import. `/lookup` has
  `createEnvLookup`, `firstEnv` and `withEnvPrefix` with no side effects; the root ESLint config forbids the bare import
  (`no-restricted-imports`, #1640).
- **One definition of the environment names and of CI detection: `@theholocron/env-utils/lookup`** (`ENVIRONMENTS`, `environment`, `detectEnvironment()`, `isCI()`; `local | development | ci | test | production`, with `dev`, `prod`, `stage`, `staging` and `qa` read as aliases). The observability logger binds `detectEnvironment()` as `env` on every line, `holocron dev` hands its application `ENVIRONMENT=development`, and Sentinel's scripts read their settings through `createEnvLookup()`, not `process.env`. Do not write a second list of the names or a second CI check.
- **Adapter pattern for new vendors.** New plugins use the
  `/holocron-skill-plugin` skill at `.claude/skills/holocron-skill-plugin/`. The
  skill produces ~14 files in the right shape; only the capability
  method bodies need to be filled in (REST calls / shell-outs).
- **REST clients (`rest.ts`):** bearer auth + `accept: application/json`
  headers, transport-failure wrapping (`ProviderApiError` with
  `status: 0` for `TypeError: fetch failed` etc.). Always returns
  `undefined` on 204 or when `expectNoContent: true`. A client opts in to
  sending a read again on a transient HTTP status with `retryStatuses` (the
  Cloudflare client does, for 500/502/503/504); a write is never repeated.
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
- **A generated file is the same bytes whichever command writes it, and passes the repo's own formatting check.**
  `holocron repo setup` and `holocron repo sync` both write the thin-caller workflows and `turbo.json`; running
  either on an up-to-date checkout must leave `git diff` empty. So: a file both commands write goes through one
  function (`thinCallerFile()` in `cli/cli/src/commands/thin-caller-file/`, whose header names `holocron repo sync`
  for either command); a generator that writes JSON uses `formatJson()` (`cli/astromech/src/utils/format-json/`),
  which lays the file out the way Prettier does (an array that fits in 120 columns stays on one line), not
  `JSON.stringify`; and a managed block (`.gitignore` skills) lists its entries in the configured order, not the
  order the installs happened to finish in. A test for a new generated file should check Prettier leaves it as it is.
  The files `repo setup` writes from the config alone come from `generateRepoFiles()`
  (`cli/cli/src/commands/repo-files/`), which needs no provider: `repo setup` writes what it returns through the
  source, `repo sync` takes its workflows and `turbo.json` from the same functions, and `holocron probe generated
check` (`pnpm exec holocron probe generated check`, the required check `Generated files / Check`) generates them
  twice and fails on a file that differs from the committed copy. A new file `repo setup` writes belongs in that
  function, not in `run-setup.ts`; one that needs the provider (CODEOWNERS) stays in `run-setup.ts`. A workflow
  that is not generated carries `# HAND-MAINTAINED` on its first line.
- **The org agent instructions live in `.agents/org.md`** (a symlink to `cli/cli/src/templates/org.md`, the copy the
  CLI embeds). This file imports it with `@.agents/org.md`. Every other repo gets it as a generated block between
  markers in its `AGENTS.md`, written by `holocron repo sync` (the `agents` step, `generateAgentFiles()` in
  `repo-files/`) and checked by `holocron probe generated check`; the rest of that file is the repo's own. Edit the
  org rules in `.agents/org.md`, never in a repo's block. `theholocron/.github-private/AGENTS.md` is the old home and
  stays until every consumer is repointed (#1217, #1229).
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
  only in-progress specs. `holocron probe specs check` checks both dirs.
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
  3. Docs are updated: `cli/cli/README.md` for any public API or
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
  `cli/cli/src/commands/upgrade-node/upgrade-node.ts` — a `matches` predicate
  on the filename and a `patch` function that replaces the old major with
  the new one. The `upgrade.node.extra` field in `holocron.config.json`
  is only for non-conventional _file paths_ (unusual locations for known
  file types); it is not a substitute for adding a new pattern.
- **PR checks must be green before merge.** `pnpm typecheck`,
  `pnpm lint`, `pnpm test`, `pnpm build` all run in CI, behind the one required check `ci / Required checks`. Run
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
  Repo: theholocron/holocron, Workflow: ci.release.yml). npm checks the
  _calling_ workflow's filename, so it is `ci.release.yml`, the entry that
  calls the reusable `release.yml`; registering the reusable fails with
  `ENEEDAUTH`. A renamed entry needs `holocron package publish --sync-trust`.
- **First publish for a new package** uses `holocron package publish --initial`
  (chicken-and-egg: trusted publishing needs the package to exist
  first). The command runs `npm login --auth-type=web` itself when
  `npm whoami` shows no session. Workflow: `pnpm install && pnpm build`
  → `pnpm exec tsx cli/cli/src/cli.ts package publish --initial --otp <code>`.
  Self-narrowing: it checks every publicly publishable package against the
  npm registry (existence, not version) and only targets the ones that
  don't exist on npm yet — re-running it after adding one new package to an
  already-bootstrapped monorepo only publishes that one, not all of them
  again. Nothing new to bootstrap is a success, not a failure.

## Repo layout

<!-- prettier-ignore -->
```text
cli/                              — core infrastructure (the CLI and its runtime)
  cli/                            — @theholocron/cli                       (binary + runtime + 20 capability interfaces)
  astromech/                      — @theholocron/astromech                 (task runner: holocron run / ci, thin callers, package scripts, linters, required checks, reusable workflows — ADR-0009, epic #581)
  datapad/                        — @theholocron/datapad                   (generic holocron.config loader — ADR-0010)
  dagobah/                        — @theholocron/dagobah                   (private: the local dev server behind `holocron dev serve` — env loading, a loopback handler server, request logging; inlined into the CLI's build, never published, #1714)
apps/                             — deployable applications (not published to npm; private, version 0.0.0 — deployed, not versioned: the deploy-on-release job deploys the commit, and their changes land in the root CHANGELOG)
  sentinel/                       — @theholocron/sentinel                  (minimal GitHub App — webhook receiver, scaffolding only, docs/wiki/specifications/tech-sentinel-v1.spec.md)
observability/                    — @theholocron/observability             (logging, errors and analytics behind one interface; releases on its own version line, tags `observability-v*`)
skills/                           — @theholocron/skills                    (shared agent skill registry; releases on its own version line, tags `skills-v*`)
clients/                          — @theholocron/*-client                  (20 API clients: axiom, checkly, clerk, cloudflare, confluence, discord, doppler, github, google, http, infisical, jira, neon, netlify, posthog, postman, sentry, slack, vercel and zendesk; release on their own version line, tags `clients-v*`)
utils/                            — @theholocron/*-utils                   (13 small libraries: array, date-time, env, fs, git, json, location, misc, object, pkg, storage, string and uri utils; release on their own version line, tags `utils-v*`)
configs/                          — @theholocron/*-config                  (17 shareable config packages: eslint, prettier, tsconfig, vitest, tsdown, commitlint, ...; release on their own version line, tags `configs-v*`)
themes/                           — @theholocron/docs-theme                (the Starlight docs theme the templates and `astro-config` use; releases on its own version line, tags `themes-v*`)
plugins/                          — vendor capability providers, one package per provider (split from cli/ as the count grew)
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
.github/workflows/                — `ci.<id>.yml` callers (one per task, gated by `ci / Required checks`), the reusables they call (`<id>.yml`), release.yml, etc.
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

## Group rules

Each group folder that was a separate repo keeps its own rules in an `AGENTS.md` (with a `CLAUDE.md` symlink) next to
its packages: [`utils/`](utils/AGENTS.md), [`clients/`](clients/AGENTS.md), [`configs/`](configs/AGENTS.md) and
[`observability/`](observability/AGENTS.md). They cover only what is specific to the group; this file covers the rest.
To add a package to a group, use that group's `holocron-skill-*` skill rather than a list of steps in prose.

Rules that hold for every published package outside `cli/`:

- **`tsdown` and `vitest` are direct `devDependencies`** of each package that builds or tests (pnpm does not expose a
  transitive binary), as `catalog:` entries.
- **`n/no-unpublished-import` is off in the shared `library()` ESLint bundle** (`configs/eslint-config/bundles/library.ts`),
  because `files` lists `dist/` while the source imports `src/`. Do not re-enable it or turn it off again per package.
- **A new package in a release group** starts at the group's current version and needs no release-config edit (the
  folder is a release group); run `holocron repo sync` to add its codecov flag and component.
- **`skills/`** needs no rules of its own: a new skill is a `src/<name>/SKILL.md` (use `holocron-skill-skill`), a row in
  the README table and a `feat:` commit; the unit test fails on a folder with no `SKILL.md`.
