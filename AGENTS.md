<!-- editorconfig-checker-disable-file -->

# theholocron/holocron — agent operating contract

`CLAUDE.md` is a symlink to this file, so Claude, Codex, and every other agent
read the same rules. Put durable, repo-wide agent guidance here.

@.holocron/org.md

## Where code lives (org-wide rule)

One rule per concern (the shared-code groups are folders in this monorepo, formerly separate repos):

- **Shareable tool config (ESLint, Prettier, TSConfig, Vitest, …)** → `configs/`. If you find yourself copy-pasting a tool config across repos, it belongs there as a `@theholocron/*-config` package.
- **HTTP clients and API wrappers** → `clients/`. REST clients for third-party services and shared HTTP primitives live there.
- **Generic, dependency-light helpers (path walking, git remote parsing, JSON formatting, …)** → `utils/` as a `@theholocron/*-utils` package, consumed here as workspace packages (`workspace:^`). If the same helper is written twice in this repo, it belongs there.
- **Anything that can be automated** → `theholocron/holocron` (this repo). Infrastructure commands (`setup`, `upgrade`, `doctor`, `sync secrets`), CI orchestration, and repo lifecycle automation belong here in the Holocron CLI.
- **`holocron.config` format** — use `holocron.config.ts` with `defineConfig` in any repo that has a `package.json` (the CLI must be resolvable at runtime). Use `holocron.config.json` in content-only repos with no Node.js infrastructure (e.g., `.github`, `.github-private`).

## Architecture

- **Capability/provider model.** 22 capabilities defined in
  `cli/cli/src/plugin/capabilities/capabilities.type.ts`. Vendors implement N
  capabilities; ESLint-style `holocron.config.{json,js,ts}` wires them
  up. Use `defineConfig` from `@theholocron/cli` in JS/TS configs for
  typed autocomplete. `vault` is no longer required (removed constraint).
- **Server as code** (`notifications`, holocron#1098). A provider's `layout`
  in `holocron.config.ts` declares the server; `setup notifications` applies
  it and `doctor notifications` checks it. Names stay provider-neutral and no
  hosting is assumed (the hosted sign-in route is one web-standard handler,
  Vercel-specific only in its thin entry file). Anything the provider's API
  can do is automated; what it cannot (OAuth redirects, the client secret)
  is reported as a `todo` that fails the run until done. Role membership
  follows a GitHub team through a per-provider links file in the org's private
  config repo, read and written with its own `github.user-sync` token. The sync is one function, `syncRoles()` (with `readLinks`, `roleTeamProblem`, `sourceProblem`), exported from `@theholocron/cli`: `sync roles` and Sentinel's role sync (`apps/sentinel/src/actions/role-sync/`, #1595, spec `tech-sentinel-role-sync`) are two adapters over it. Sentinel runs it on `membership` (team) and `organization.member_removed` deliveries, only when `SENTINEL_ROLE_SYNC_REPO`, `HOLOCRON_DISCORD_BOT_TOKEN` and `HOLOCRON_USER_SYNC_TOKEN` are set. The
  capability methods behind it are optional on `Source` and `Notifications`. A server can also be created from the layout (`new server`): the bot makes it and applies the layout as owner, writes the new id into the config, invites a person and hands the server over; the doctor fails while the bot still owns it.
  The secrets a layout fills (`HOLOCRON_NOTIFY_*`, the webhook URLs and role ids) are organization secrets readable only by the layout's `readers` (`owner/repo` list on `NotificationsLayout`, `.holocron/notifications.ts`, #2131, spec `tech-org-secret-visibility`): `notifications setup` and `new channel` pass `layoutSecretScope()` (visibility `selected`, those repositories) to `setSecret`, which also narrows a secret that was `all`, and refuse to write an organization secret when `readers` is absent or empty (fail closed, never `all`; `--dry-run` and a `repo`/`env=` scope need none). `doctor secrets` compares the layout's secrets with `readers` in its `org-secret-access` row. They are not a `repo.secrets.sync` entry, so the secrets have one writer.
  A pinned message can take its text from a file in the repo (`pinned: [{ channel, file }]`, `.holocron/pinned/rules.md` for `#rules`, #1533): the CLI reads the file (`resolvePinnedFiles()`) before it calls the provider, so a provider only sees `content`; the file wins over a hand edit and `doctor notifications` reports the drift (spec `tech-discord-channel-content`).
  The runs nobody watches reach Discord through one hand-maintained workflow, `platform.notifications.yml` (#1159): a run that errors on `alpha`/`main` posts to #alerts with the gatekeepers ping (to #deploys for a deploy), a deploy, preview or Preview Check that succeeds posts to #deploys on any branch (deliberately noisy, #1578), and a release posts the tags it made to #releases. The post for a run that errored names the failing jobs of the run, with links (five at most, `actions: read` on that one job, #1614). It triggers on `workflow_run` of the caller workflows, so it sees the caller's name, which is its task id (`release`, `test:unit`; #1620), and tells a release or a deploy apart by its file (`workflow_run.path`, `ci.release.yml`); a release's tags are read from git, because a package line is tagged without a GitHub release. `doctor notifications` checks that the file is on the default branch, that the `HOLOCRON_NOTIFY_*` secrets it reads are the ones the layout fills and that the workflows it lists are task ids and not the old group names (`notificationsWorkflowChecks`, #1581, `workflowNameProblems`, #1620).
  A forum's `defaultReaction` (Discord's one default, set by `ensureChannel`, checked by `doctor notifications`) and `starterReactions` (added by the bot to the first message of each post `ensureDiscussion` makes, failures skipped; #1822) give a spec or ADR post approve, disapprove and question reactions to hand; Unicode emoji only.
  Sentinel's `#prs` forum feed (`apps/sentinel/src/actions/pr-feed/`, #1738, spec `tech-sentinel-pr-feed`) keeps one post per pull request in a forum with `feeds.prs`: `renderPullRequest()` and `renderCiMessage()` are pure, `runPrFeed()` reads the pull request from the API (never the webhook payload), edits the post's summary and tag, makes a missing post quietly and then re-reads the forum before it de-duplicates (`dedupeDiscussion(..., { refresh: true })`: the Discord provider reads a forum once per instance, so two deliveries that raced on different instances would each keep their own post), keeping the oldest, and appends a line for the open, the `ci / Required checks` verdict (with the failing checks) and the close, each ending in a `-# ci:` / `-# pr:` marker that is looked for first so a redelivery posts nothing twice. It runs on `pull_request`, `pull_request_review` and `check_run` (only the aggregate check, filtered before any fetch), uses role sync's env and no secret of its own, and is a quiet `skipped` when it is not configured.
  `doctor notifications --post [channel]` shares a drift check you ran yourself (#1585): the bot posts the failing steps, or only the summary line when every step passed, through the optional `Notifications.postMessage`; the provider tokens it reads with stay local. A weekly `platform.doctorReminder.yml` post reminds a maintainer to run it.
  A forum can carry the pull-request feed, `feeds.prs` (`true`, or `{ exclude: { repos, authors } }`, #1834, spec `tech-sentinel-pr-feed`): one post per pull request, tagged with its state. `forumLayoutProblem()` allows it only on a forum that has all eight state tags (`PR_FEED_TAGS`), and `doctor notifications` adds `pr-feed-forum`, `pr-feed-tags` and `pr-feed-bot` rows (`prFeedChecks()`, the last from the optional `ServerInspection` `botThreads`, which Discord's `inspect` fills in for such a forum after the channel's overwrites). `setup` needs nothing beyond the forum and its tags.
  `doctor notifications` also has a `bot-permissions` row (`botPermissionChecks()`, #1853) from the optional `ServerInspection` `botPermissions` (`{ missing, inviteUrl? }`, filled by Discord's `inspect` from the bot's roles server-wide against the plugin's `needs()`, the single list the invite link also uses; owner and Administrator hold all, channel overwrites stay with the forum row): it fails naming the missing permissions with the invite link (not a credential) and is skipped when the roles could not be read (`botPermissionsError`).
  An error tracker's alerts reach a channel through the Comlink relay Worker (`apps/comlink`): `Errors.ensureRelay` (optional) makes the tracker's integration and alert rule and returns its signing secret, which `setup notifications` hands to the Worker in the same deploy (`relay.errors` in the layout). The secret is never printed, setup never deletes, and the tracker gets its own token (`sentry.comlink`).
- **Credentials** (`credentials` capability, #1606). Where this machine reads its own tokens, ahead of the keyring: a provider that needs no token of its own (1Password, through `op`) returns the variables of the environment named by its own `environment` option in `providers.credentials` or, for a provider with none, by the shared `credentials.environment` (`credentialsEnvironment()` picks it). A 1Password entry with neither derives its names (#2063, spec `tech-environment-name-derivation`, `cli/cli/src/credentials-environments/`): `<org/repo>` from the `origin` remote (`repoSlug()`; an unparseable remote is a `ConfigError` naming `environment`) and the layer from `detectEnvironment()`, so a machine reads `<org/repo> - local` (silent when absent) then `- dev`, `holocron dev` `- dev`, CI `- ci`, production `- prod`, `test` none; a missing required one is reported by name and there is no other fallback. The rest of the config names a layer, never an Environment (#2069, spec `tech-environment-layers`): `repo.secrets.sync`, `repo.variables.sync`, `repo.secrets.deploy`, `githubApps[]`, `dev` and the `vault` options take `layer: "local" | "dev" | "ci" | "prod"` in place of `environment` (both together, or an unknown word, is a `ConfigError`; a literal `environment` still works). `layerEnvironment()` (`credentials-environments/layer-environment/`, the one place `<org/repo> - <layer>` is built, shared with `environmentLayers()`) names it, and `loadConfig()` runs `resolveLayers()` (`config/resolve-layers/`) after `resolveConfig()`, so every `layer` has become an `environment` before a command or a doctor reads it (the remote is read once, only when a layer is named; an unreadable one is a `ConfigError` naming `environment`). `resolveConfig()` only validates, which is what Sentinel's config check runs. `holocron sync secrets <x>` takes a layer word (`resolveEnvironmentId()`, case-sensitive: a literal wins only if it is not exactly a layer word) or a literal name. In this repo the secrets and variables sync use `ci` (the variables Environment merged into it), Sentinel's and Comlink's `vault`, `repo.secrets.deploy` and the sync workflow use `prod`, `githubApps` points at `prod` and `dev`, and `holocron dev` uses `dev`. The CLI passes the name to `read`, so the plugin never stores it. `PluginLoader.load()` (kyber's `createPluginSystem` with a `preload` step) loads the `credentials` providers first and reads each into the in-process credential store (kyber `/secrets` `credential-store`) once, and the token resolvers (`createResolveToken`, `createFeatureResolver`) look a token up there after the flag and the process environment and before the keyring. A provider that fails to load or read is recorded and skipped. The repo's own `<repoRoot>/.env` is read the same way, first (`auth/dotenv-file`, through `PluginLoader.load()`), so the chain is flag, process environment, `.env`, `credentials` providers, keyring; it is optional, needs no config and is never read from the working directory. (Importing `@theholocron/env-utils` still loads a `.env` from the working directory into `process.env` through `dotenv/config`; that side effect predates the explicit step.) `holocron doctor credentials` (a `DEEP_CHECKS` entry) compares the environment with the tokens the configured plugins list, through the optional `Credentials.inspect`, which returns names and never values; its loader is built with `readCredentials: false`, so the providers are not asked for a value at all. `holocron export tokens` (`commands/auth-export`) writes the keyring's tokens as `NAME=value` for the plugins' `tokens` to a private, git-ignored, never-overwritten `.credentials` (mode 0600) that it deletes once the 1Password import is done, or to stdout when that is a pipe, or to the clipboard (`clipboardy`) on `--copy`, never to a terminal or a redirected file (`stdoutKind`), to fill an environment the CLI cannot write to. It is separate from `vault`, the source of truth `sync secrets sync` fans out from. `sync secrets <environment>` follows `repo.secrets.sync` (each entry's `keys` to its `scope`, one step per scope; `--github-secret` overrides, #1702; the `local` and `dev` layers are never synced, a `ConfigError` before anything is read whatever flags are given, and a `repo.secrets.sync`/`deploy` entry naming them does not load (`assertSyncableLayer()`, `credentials-environments/unsynced-layer`); an environment with no entry and no `--github-secret` is a `ConfigError` before the vault is read, `--dry-run` included, and a deployment or Worker sync alone writes nothing to `secrets`, #2104). An `org=` entry names its readers (#2062, spec `tech-org-secret-visibility`): `repos` with visibility `selected`, never `all` or `private`, a `ConfigError` at load without them (`validateSecretsSync()`), names resolved to ids by the plugin (`Secrets.setSecret` takes `visibility`/`repos` on the organization `SecretScope`; a name that does not resolve is a failing row), each row showing the change of readers from the optional `Secrets.listSecretAccess` (`accessNote()`), and `doctor secrets` rows `org-secret-access` and `org-secret-shadowed`; `setup notifications`'s `HOLOCRON_NOTIFY_*` still get `all` (follow-up). A `deployment` (`--project-id`) or Worker (`--worker`) destination fails closed (#2061, spec `tech-deployment-key-allowlist`): it receives only the keys `repo.secrets.deploy` names for the environment (`keys` and/or `prefix`, `deployFilter()`), an entry with neither is a `ConfigError` at load and a sync with no entry stops with one before the vault is read; a filtered name is a skipped row by name only, and `doctor secrets` has a `deploy-<environment>` row of the names that would go out and skips a value that is blank in the vault in every destination, so a placeholder never overwrites a working secret. The same command fills GitHub Actions _variables_ from `repo.variables.sync` (#1817, spec `tech-variables-sync`): the `ci` layer's 1Password Environment, the same one as the secrets (the sync lists decide where each name goes; a vault does not tell a visible value from a secret one, so list only names that are not secrets), each key written through `Source.syncVariables` / `syncOrgVariables` one call at a time without pruning, a blank skipped, values never printed; a name that is also a literal `repo.variables.*` value, or `prune` with `sync`, is a `ConfigError` (`validateVariablesSync()`), and an environment declared only for variables pushes nothing to `secrets` or `deployment`. `doctor variables` adds a names-only row per entry; `doctor secrets` ignores them. The wait-for-the-import-then-delete step is `finishCredentialsFile()` (`@theholocron/kyber/secrets`; the `.credentials` name and the 1Password import text stay in the callers), shared with `holocron new github-app` (#1674), which makes a GitHub App from a manifest (GitHub's manifest flow: `buildAppManifest()`, `appManifestPage()`, `serveAppManifest()`, a one-shot loopback server, and `convertAppManifest()`, the code exchanged once, all from `@theholocron/dagobah`) and writes its id, key and webhook secret the same way.
- **`.holocron/` area files** (epic #1747, SPEC-0069, `docs/wiki/specifications/tech-holocron-directory.spec.md`). The big declarations of `holocron.config` can sit in `.holocron/<area>.{ts,js,mjs,cjs,json}`, read by name from a closed list. Three layers: datapad (generic: the directory and the area names are parameters) has `loadConfigDir()` (disk), `readConfigDirSource()` (remote probe per area) and `writeConfigDir()` (the sandbox writer: writes a tree of fetched files with their relative paths, so an area may import a sibling); kyber's `createConfigSystem` takes optional `areas` and `place(areas, raw)` and calls them after `loadConfigFile` and before `derive` (directory `.<name>`); the CLI owns the area names (`HOLOCRON_AREAS`: `notifications`, `repo`, `org`) and where each lands (`placeAreas()`: the `layout` of `providers.notifications`, keys of `repo`, and for `org` `placeOrg()` fills a provider option such as the Vercel `teamId`, a Checkly `accountId` or the Sentry `org` into each provider entry that leaves it out, #1820, and sets `config.domain` from the area's top-level `domain` when the config leaves it out, #1877; a file that builds a hostname at definition time imports `org.js` instead: `./org.js` from an area file, `./.holocron/org.js` from the root config). An area has one file (`.ts` wins over `.json` if both exist); `.ts` in this repo, `.json` for a repo with no `package.json`. Inline and file both set is a `ConfigError` naming both. What stays inline: `tasks`, the other providers, and in `repo` the `defaultBranch` (Sentinel needs it to know which branch to read), `protection` and `properties` (the preset's). No secret goes in the directory (names only). The `org` area holds only org constants that CI does not need; what CI needs (`CLOUDFLARE_ACCOUNT_ID`, `TURBO_TEAM`, `AXIOM_DATASET`, `SENTRY_ORG` for the release workflow) lives in 1Password and syncs to a GitHub variable, with no other copy. Only `org` is shared (`SHARED_AREAS`, #1829): a config in a subdirectory (`apps/sentinel`) also reads the repository root's `.holocron/org.*` (datapad `loadConfigDir({ shared })`, the nearest `.git`; kyber `shared`), and its own `.holocron/org.ts` overrides a key set in both, option by option, with no error (`placeOrg()` merges `area.root` under `area`); `repo` and `notifications` describe the repository, so they stay local. Sentinel's remote loader reads a repo's root config, where the directory is the root, so it inherits nothing. `.holocron/projects/<name>.json` (SPEC-0020) is not an area: the project-template folder, read by its own default. Sentinel's `validateConfig()` lists `.holocron/` at the config's `ref` (`git.listDirectory`, recursive), fetches the whole tree within caps (50 files, 100 KB each, 512 KB in all; `fetchConfigDir()`), leaving out pictures (`MEDIA_EXTENSIONS`: a config cannot import one, so the 380 KB webhook avatar neither counts nor fails the check), writes it with `writeConfigDir()` before the config is evaluated, then `loadConfigDir()` and the CLI's `placeAreas()` (both `placeAreas` and `HOLOCRON_AREAS` are exported from `@theholocron/cli` for this) merge the areas, so role sync, property sync and the PR config check see the same config as the CLI. Only what the config or an area file imports is evaluated; a new area needs no Sentinel change (#1785). This repo's Discord layout lives in `.holocron/notifications.ts` (#1786), typed with `satisfies NotificationsLayout` (a type-only import; there is no `defineLayout()` helper); `holocron.config.ts` keeps `guildId`. The `repo` block's `teams`, `topics`, `variables` and `secrets` live in `.holocron/repo.ts` (#1787, `satisfies RepoConfig`, names only); `holocron.config.ts` keeps `repo.defaultBranch` and the preset's `protection`/`properties`, and a key set in both is an error (no inline-wins merge). `RULES.md` and the webhook avatar moved too (#1788): `.holocron/pinned/rules.md` and `.holocron/media/webhook-avatar.png`, named by explicit paths in the layout. Root files `holocron.config.ts` and `.holocron/*.ts` are covered by knip (root `entry`/`project`) but not yet by `lint:code`/`typecheck`, which run per workspace package. `load-config-self-adoption.test.ts` (#1806) loads this repo's own config and checks the layout and `repo` keys come from `.holocron/` (and are not inline), and that the resolved config equals the pre-move snapshot (`holocron-self-adoption.pre-move.snapshot.json`, from `e7fca267c`); `holocron-config-size.test.ts` fails if `holocron.config.ts` passes 200 lines (426 before, 154 now). Deploy gate (human steps): the first move (#1786) merges only after the #1785 Sentinel is running on the dev instance and a real PR's config check passed there (production is down, #1100). After the moves land, compare `holocron show config` before and after, then run `holocron doctor notifications`, check role sync reads the layout from `alpha`, and run `holocron probe generated check` (clean).
- **Private directory** (#2078, spec `tech-holocron-private-directory`). `.holocron/.private/` holds files that carry secrets: a tracked `.gitkeep` and a `.gitignore` managed block (`.holocron/.private/*`, `!.holocron/.private/.gitkeep`) written by `generatePrivateDirFiles()` (inside `generateRepoFiles()`, so `setup`, `sync private` and `probe generated check` share it). The path lives in the CLI (`cli/cli/src/private-dir/`: `PRIVATE_CREDENTIALS_FILE`, `resolveCredentialsFile()`, which makes the directory, and `ignoreAdvice()`), because kyber carries no Holocron names; `export tokens` and `new github-app` default to `.holocron/.private/.credentials` (`--file` wins) and keep every refusal.
- **Probes** (`holocron probe <provider> <probe>`, epic #1166). A plugin may return `probes` from `createPlugin` next to
  `capabilities`: named, on-demand pokes at a live provider (inspect, or prove something end to end). They run under
  `runProbe`: output is scrubbed of secrets, a change goes through `ctx.write` (skipped on `--dry-run`, refused for a probe
  without `writes: true`), a writer is asked about first (`--yes` without a terminal), and what it registers with
  `ctx.cleanup` is undone on success, failure and Ctrl-C. `doctor` compares the config with reality; a probe has no layout.
  The `docs` probes measure doc-comment coverage of the public API (`docs coverage`, `docs patch`, `docs lcov`), which is every
  entry in a package's `exports`, subpaths included (`subpath-entries.ts` maps each to its source); `--lcov <path>`
  on the first two also writes the lcov report, which the `measure:docs` workflow uploads to Codecov as the `documentation`
  flag (spec `tech-api-docs`, epic #1368). `repoValidation.docsCoverage` (`off` default, `warn`, `required`) in
  `holocron.config.ts` decides what `docs patch` does about a miss and whether `setup` writes the flag's statuses.
  `docs tokens` (#1727) fails for each token name a plugin resolver declares (`envName`, `vendorEnvName`, `keyringService`,
  `keyringKey` in `plugins/*/src/auth.ts`, and `commands/setup/run-setup.ts`) that `docs/src/content/docs/tokens.mdx` lacks
  (in the plugin's own row; Discord and GitHub have their own tables); it reads through an injected `DocsTokensIo`.
  `1password export-environment <environment>` (#2076, spec `tech-1password-export-environment`) is a writer probe: it reads one Environment through `OpCredentials.read` and writes `NAME=value` to a private `.holocron/.private/.credentials` (terminal), stdout (pipe) or the clipboard (`--copy`) with `stdoutKind()`, `resolveEnvironmentId()` (both exported from `@theholocron/cli`) and `finishCredentialsFile()`; a `Probe` with `reportsTo: "stderr"` keeps its rows off stdout, and the CLI forwards `--only` and `--copy` as probe arguments.
  `cloudflare token [zone...]` is the first token-permission probe (`Probe.acceptsToken`): it reads one list per permission the plugin uses (`tokenProbe()`, `plugins/holocron-plugin-cloudflare/src/probes/token/`) with the plugin's own account id, so a person never types one. Under a layer the rows are two headed groups, `Should have` and `Should not have` (a rightly missing permission is a bare `ok`), with no preamble rows; how a token is chosen is the `probe` command's `--help` epilogue (`TOKEN_PROBE_HELP`), not run output. A row for a token with no layer is `ok` for a list with items, `info` for a 401/403 or an empty list (Cloudflare answers a token without the permission either way, so a status alone proves nothing), `fail` only for an error that is not about access. `runProbeCommand()` points a probe that `acceptsToken` at another token: `--token <provider>=<value>`, else `--environment <layer or name>` (a layer word or a name in `ownerEnvironments(config)`, nothing else; `local` reads `- local` over `- dev`; `environmentToken()`: the vault reads the Environment in memory and takes the first of the variables the plugin's `tokens` lists; the loader is built again with that token as the provider's `cliToken`; when the Environment is a layer word the probe is also handed `--layer <word>` and judges the token against what the plugin's `tokens` export declares in `PluginToken.expect` (`TokenExpectation`, #2149, spec `tech-token-declaration`: `permissions` per layer, each permission `required` or `absent`, and `layers` for a token held with no rules), read only through `tokenExpectations(tokens, { layer?, envName? })` from `@theholocron/cli` (one `LayerTokenExpectation` per token and layer: `rules`, `required`, `absent`; the probes, the later doctor and the docs check all use it, none walks `expect` itself), which mirrors the permission table in `tokens.mdx` (a required permission it lacks, or one it must not have, is a `fail`), while any other token is only described), else on a terminal `chooseToken()` asks (configured, an Environment, or a hidden paste). **When a token gains a permission, update three places together:** the permission table in `docs/src/content/docs/tokens.mdx`, the Environment layer that holds the token (`ci` only if CI needs it), and the probe's checks, so `probe <provider> token --environment <layer>` stays the proof. Extending this to every token, with rotation checks, is the epic #2147.
  `docs tokens` also compares each token's declared permissions per layer (`PluginToken.expect`, read through `tokenExpectations()`) with the permission table in `tokens.mdx` (#2150): a table with an `Id` column and a column per layer whose cells are `required` or `absent`, the one whose heading names the token's env var or the plugin; it fails naming the token, layer and permission that differ, both ways, and a plugin whose built package cannot be imported is an `info` row. It does not compare the probe's check labels (that would couple the CLI to each provider's probe). `docs validate` runs `presence` then `tokens`, and is what the `validate:docs` task calls (a registry command cannot chain).
  `docs presence`: it warns (never fails) when a new public
  package, or a `feat` to one, ships with no docs change, and `[skip docs] <reason>` in the PR description or a commit
  message excuses it (#1515). Its rules are pure functions in `@theholocron/astromech/repo-validation` (#929); the probe
  only supplies them with git data, and Sentinel is meant to supply the same rules from the GitHub API. A registry task can be a holocron subcommand (`local: { command }`).
  `specs check [files...]` is the `validate:specs` task (#929): it fails for each ADR (`docs/wiki/decisions`)
  or spec (`.notes`, `docs/wiki/specifications`) whose frontmatter is wrong and reports a warning as an `info` row. The rules
  are `checkSpecs()` in `@theholocron/astromech/repo-validation`; the probe reads the files through an injected `SpecsIo`,
  and Sentinel's `validate-adrs` action fetches a PR's changed files and passes their text to the same function.
  `tasks names` (#1618, spec SPEC-0064) lists the hand-written places (workflows, scripts, docs, `turbo.json`, `package.json`, configs, hooks) that still use an old dotted task name, with file, line and the flat id to use; failures (exit 1), or `info` rows with `--warn`; `--files` adds workflow file names, which are skipped by default. It reads astromech's `LEGACY_NAMES` (`legacyReplacements()`), also finds a bare old name used as a task and a reserved script name, and an intentional mention carries `holocron-allow-old-name`. `doctor repo` compares the ruleset's required contexts with `requiredChecks()` (`compareRequiredContexts`): `missing required check` and `stale context` rows.
  `sync specs` numbers each spec (`id: SPEC-0007`; ADRs have `ADR-0009`) and keeps a forum post per ADR and spec (titled
  with the document's own title, tagged with its status) in step with the files
  (#1535, spec `tech-specs-discussion-threads`): it finds or makes each post through optional `Notifications` methods
  (`ensureDiscussion`, `readDiscussion`, `updateDiscussion`), writes `discussion.url` and, when a gatekeeper retagged a
  post, the file's `status:` into the working tree only (the workflow commits it to a pull request), and decides by
  `reconcileSpecStatus()` over the file's, the tag's and the last-synced status. The same methods serve a pull request's post (key `owner/repo#123`, state the tag name, #1832): `DiscussionPatch.body` replaces the first message's text, and the optional `postDiscussionMessage` (unarchives and unlocks a closed post, writes, closes it again), `readDiscussionMessages` (newest first) and `dedupeDiscussion` (keeps the oldest post of a key, deletes the rest) append, read and repair; `duplicateDiscussions` (read-only: the keys with more than one post) is what `holocron cleanup posts [channel]` (`commands/cleanup-posts/`, a `workspace` command, asks first unless `--dry-run`/`--yes`) uses to clear duplicates that are already there, the pull-request forum by default. `--refresh-origin` and `--refresh-titles` (#1654, #1657) are
  opt-in repairs that patch one field of existing posts (the `PR:` line, the title); `--refresh` (#1658) runs both and the id
  repair in one pass. The id opening a post's first message is a link to the file on the default branch
  (`discussionIdLine()`, `repo.defaultBranch`, else `HEAD`) once the file is there, and plain text while `--pr` names an
  open pull request. The normal sync (the hourly `sync-specs` run) rewrites a post's id line whenever it is not what
  `discussionIdLine()` gives and the run has no `--pr` (#1663): a file followed to a new path, a post made while its pull
  request was open. It compares `DiscussionPost.idLine`, which comes with the post, so a run where every post is right
  adds no request, and writes through `DiscussionPatch.idLine` (only the first line of the message); `--refresh` does the
  same for any run and also takes a link off. A Discord rate limit (429) stops a run
  cleanly (`rateLimited` in the report, `left` documents) and the next run continues. `--files` limits a run to the given
  paths and `--pr` names a pull request on the posts: the `preview-specs` task uses both to post while a
  same-repository pull request is still open (#1600), and throws the edits away; the post is linked after the merge.
  `--refresh-origin` (#1652) is an opt-in repair, never a standing behaviour: it compares each post's `PR:` line
  (`DiscussionPost.prLine`) with `discussionPrLine()` and passes `DiscussionPatch.prLine` to `updateDiscussion`, which
  swaps only that paragraph of the bot's first message and leaves the synced footer, tag, title and closed state alone.
  `--withdraw --files <paths>` (#1653) tags the post of a spec or ADR `withdrawn` and closes it, for a pull request closed
  unmerged (the same workflow on `closed` with `merged == false`, same-repo only, CLI built from the BASE branch so the bot
  token never runs a closed pull request's code). `withdrawn` (`WITHDRAWN_STATE`) is a tag and a closed post only: never a
  file status, and `reconcileSpecStatus()` treats it as no tag (`set-tag`, never `request`), so a sync pull request cannot
  write `status: withdrawn` and a reopened pull request restores the post.
- **Provider setup and doctor** (`holocron provider [name] [setup|doctor]`, SPEC-0071, #1859). What only one vendor has (a Linear team's labels, project, auto-close and auto-archive) has no provider-neutral vocabulary, so a plugin may return optional `setup` and `doctor` from `createPlugin` next to `capabilities` and `probes` (`ProviderAction`, `(ctx: { dryRun }) => Promise<ProviderRow[]>`, `ProviderRow` being kyber's `CheckRow`; `PluginLoader.providerActions()` lists them, a provider with neither is not listed). `runProvider()` (`commands/provider/`) prints the rows through `printCheckRows` / `printCheckSummary` (the `doctor <capability>` renderer), exits 1 on a failing row, scrubs the run's tokens from the output with the probes' `createScrubber`, turns a throw into a `fail` row, and for `setup` asks first unless `--dry-run` or `--yes` (`NonInteractiveError` without a terminal). The names come from the loaded plugins, so it is `provider [name] [action]` like `probe`, not a yargs subcommand per provider. The provider reads its own options, not flags: Linear's are under the `issues` entry (`labels`, `project`, `automation.autoClose/autoArchive`, `automation.git`), validated by `parseLinearSetup()` as a `ConfigError` naming the path, and `linearSetup()` / `linearDoctor()` (`plugins/holocron-plugin-linear/src/provider/`) share `closeGap()` / `archiveGap()` so setup and the doctor cannot disagree. Setup never deletes, leaves an existing label or project alone and is a no-op the second time. Linear's git automation and issue templates are not applied or compared yet (the git rules and templates are open questions 6 and 7 of the spec: reading the git rules back is unverified); the git rules are validated and reported as a skipped row. `CANONICAL_LABELS` is exported from `@theholocron/cli` for the label colours. A provider the config does not name (this repo keeps GitHub as the one `issues` and `projects` provider and runs Linear this way) is run with `--with` (repeatable): a `key=value` pair (`parseOptionPairs()`, the syntax of `migrate`'s `linear:team=ENG`) or the path of a `.json`, `.ts`, `.js`, `.mjs` or `.cjs` file holding the options object, read by datapad's `loadConfigPath()` (`readWithOptions()`, later values win key by key, a nested object is replaced whole). `PluginLoader.loadProviderActions(name, options)` (kyber's `loadProvider(tuple)`) builds that plugin with no capability slot, so the cardinality rules and the registry are untouched; it throws `WorkspaceContextError` for a package that does not resolve and the plugin's own parser still validates the options as a `ConfigError`. Where the config does name the provider, the first entry's options are the base and `--with` wins. The config file is never written, the token comes from the normal chain or `--token` and is scrubbed from the output, and `--dry-run` / `--yes` apply as before.
- **Tunnels** (`tunnels` capability, #1678). A named tunnel with a stable public hostname to a port on this machine, for a webhook that has to find a development instance. `Tunnels.ensureTunnel()` finds the tunnel by name or makes it and makes it serve a hostname (other hostnames' rules kept, the `http_status:404` catch-all last, nothing rewritten when it is already right); `tunnelToken()` is a credential and is never printed. `holocron new tunnel` (`commands/tunnel-up`) puts it together with the `dns` provider (a proxied `CNAME` to `<id>.cfargotunnel.com`) and, with `--run`, starts `cloudflared` in the foreground with the token in `TUNNEL_TOKEN`, never argv (`runCloudflared()`). `holocron dev` (`commands/dev`) is the same with the application, configured by the `dev` block of `holocron.config` (`DevConfig`: environment, tunnel name and hostname, port, command; flags win, `resolveDevOptions()`): it reads a vault environment's variables in memory, sets up the tunnel through `runTunnelUp()`, and runs the application beside `cloudflared` (`superviseProcesses()` from `@theholocron/dagobah`, which knows nothing of Cloudflare: the `primary` gets the variables and `PORT`, the `companion` gets `TUNNEL_TOKEN`; Ctrl-C stops both and is not a failure). The application is `dev.command`, or, for a web-standard handler, `dev.serve` (`DevServeConfig`: `handler`, `export`, `required`, `logging`): `resolveDevOptions()` then makes it `holocron dev serve` (`commands/dev-serve`, #1718), which loads the handler with `tsx` after the vault's variables are in `process.env` and serves it on `PORT` through `@theholocron/dagobah`. Values and the token are never printed or written.
- **Projects** (`projects` capability, spec `command-project`, SPEC-0020, #1744). The boards that plan work, in a vocabulary
  no tracker owns: board, item (an `issues` key), status with a category (`BoardStatusCategory`: `backlog`, `planned`, `active`,
  `blocked`, `done`), blocker, rule, template. It sits beside `issues` (one issue; `projects` is what holds them), so a move
  from GitHub Projects to Jira changes a provider entry and a plugin, not the commands, templates or config. A board is
  found by name among the open boards, no project number is stored, and `providers.projects` holds only a list of
  `{ template, name }`. A template is a file, never inline config: the built-ins (`roadmap`, `sprint`) ship in
  `cli/cli/src/commands/project/templates/`, `validateTemplateFile()` checks a file and `resolveTemplate()` merges an
  `extends` in by name. The capability's mutating methods are optional (`ensure`, `items`, `setStatus`, `move`), and a
  field change must never clear an item's value: the GitHub provider sends every existing option with its `id`.
  `holocron project` (`commands/project/`, one parent, `project.command.ts`) has `list`, `create`, `close` and `setup`; each
  is `project-<name>/` and loads the provider through `openProjects()`; a new subcommand is one `.command()` there plus a
  `COMMAND_CONTEXTS` and a `COMMAND_REGISTRY` entry.
  `holocron doctor project [--post]` (a `DEEP_CHECKS` entry, `commands/doctor-project/`) compares each declared board
  with its template, one row per status list, field, view and rule; what a board has beyond its template and the items
  `reconcile` would fix are `info` rows (shown as skipped), never a failure, and `--post` reuses `postDoctorReport()`.
  `holocron move issues <from> <to>` (`commands/project/move/`) calls the optional `Projects.move`, asks first unless
  `--yes`, and on `--dry-run` previews from both boards' `items()`; `openBoardContext()` (`project/board-context/`) is
  how both read the provider, the declared boards and the templates.
  `holocron reconcile project [board]` (`commands/project/reconcile`, part 5) sets status only, by `planReconcile()` (pure: open blocker to `blocked`, unblocked to `planned`, closed to `done`, an open item with no status reported) through `Projects.setStatus`; it is the task `reconcile-projects` (a registry task with a reusable template, `ci/workflows/reconcile-projects.yml`, and a thin caller scheduled hourly, like `check-tokens`; enabled in `tasks:`) that runs it, then `doctor project`, with a GitHub App token (the org variable `SENTINEL_GITHUB_APP_ID`, filled by `repo.variables.sync`, and the org secret `SENTINEL_GITHUB_APP_PRIVATE_KEY`, filled by `repo.secrets.sync`; the workflows read the id as `vars.` then the old secret of the same name, and the key first and the old `SENTINEL_APP_ID` / `SENTINEL_APP_PRIVATE_KEY` as a fallback until a later change removes it, #1672), and `platform.notifications.yml` lists `reconcile-projects` for the `#alerts` post.
- **The organization's `holocron_capabilities` property** (#1862). Its allowed values are an organization setting, not code, so a capability added to the CLI (`CARDINALITY` in `plugin/capabilities`) is a value somebody has to allow before any repo can declare it. `doctor repo` checks every capability the CLI defines against the property (`repo-capabilities-allowed`, `Source.getOrgPropertyValues`) and names `holocron apply properties`, the separate command that adds the missing ones (`Source.addOrgPropertyValues`; GitHub replaces the whole definition on a write, so the current one is read and sent back extended, never reduced). The doctor never writes; `setup` does not write the schema. `capabilityValues()` is the one list both use.
- **Migrating between trackers** (`holocron migrate`, `commands/migrate/`). The optional `Issues.export(selector)` and `Issues.import(records, options)` exchange `IssueRecord`s (title, body, state, `IssuePriority`, labels, assignee, milestone, parent, `blockedBy`, comments, dates), so any two providers that have both can be migrated between; GitHub and Linear today (`plugins/holocron-plugin-linear`, `clients/linear-client`). `issues` is a single provider in a config, so `openSide()` builds one loader per side over a copy of the resolved config whose `providers` hold only that endpoint (`--from github`, `--to linear:team=ENG`; the endpoint's options are applied over the repo's own entry for the same provider). `migrate issue|issues|project`: a project reads a board's items through the source `projects` provider and lays the item's status and priority over the exported issue (`BoardItem.priority`). When the target's `projects` provider has the optional `Projects.addItems(owner, board, items, template)` (GitHub; #1860, SPEC-0071 section 3), `migrate project` puts the migrated issues on a board of the same name instead of a milestone: `resolveBoardTarget()` settles the owner and the template (`--template`, default `roadmap`), `placeOnBoard()` finds or makes the board and calls `addItems`, which adds each issue by node id and sets Status (the option named like the record's status, else the template status of its category) and Priority (an option named `urgent`..`low` or `P0`..`P3`) only where the item has no value; a value with no option is `dropped` and counted in `not carried across`, never created. The milestone is then set only by `--milestone`; a target without `addItems` keeps the board-name milestone. `openSide()` loads the target's `projects` as `optional`. Linear need not match GitHub: an import returns `dropped` lines per record for what the target cannot hold, and `tallyDropped()` prints them at the end of every run, dry or not; the differences are tabled in `docs/src/content/docs/plugins/linear.mdx`. **A trial run** (#1959): `--limit <n>` and `--order <oldest|newest>` (default `oldest`, the first created; no effect without `--limit`) on `migrate issues`, `migrate project` and `sync issues`, never `migrate issue`, are `IssueSelector.limit` / `order` (parsed by `parseLimit()` in `commands/migrate/parse-limit`, declared by `limitOptions()`), and the optional second argument of `Issues.export`, `ExportInfo`, lets the provider say how many the selection matched (`matched`), for the `limited to N of M` line (`describeLimit()`) printed in a dry run and a real run. The limit counts issues that survive `--open-only`, `--since` and the skipping of pull requests. A list of keys (a board's items, `--keys`) is sorted by the key's number (`orderKeys()`; GitHub and Linear numbers rise with creation in one repository or team) and fetched in the chosen order, at most four at a time and never more than the places still open, until `limit` records are kept (`readKeysLimited()`); a listing (`--all`, `--source-milestone`) is cut on `created_at` / `createdAt` before the per-issue requests (`pickByCreation()`). **Progress** (#1965): `Progress.run` / `withProgress` in `@theholocron/kyber/ui` give the step an `update(text)` (a no-op when no spinner is drawn), and the optional `onProgress(done, total)` on `ExportInfo` and on `ImportOptions` (also what `sync` takes) lets a provider report each issue read and each record written (`reportProgress()` calls it and ignores a throw; GitHub `readIssues`, Linear export, both `import` and `sync`). `runMigrate()` and `runSyncIssues()` wrap the read, the write (`Checking <provider>…` on a dry run) and the board placement in `input.progress` (default `createProgress(print)`, drawn only when `progressEnabled()`), updating the text to `Reading issues from <provider>… <done> of <total>` / `Writing to <provider>… <done> of <total>`; the spinner is cleared when a phase ends, so the confirmation and the result lines are as before, and piped, CI or `--quiet` output is unchanged. A key list fetched before the per-issue read (`readKeysLimited`) shows the bare label until the read starts counting. Records come back oldest first whichever end is chosen, a second run with the same limit selects the same issues, and what exists on the target is skipped as before. A target records the source address (a `holocron:migrated-from` marker on GitHub, an attachment on Linear), so a second run skips what exists; an import is two passes, issues first, then parent and blocked-by links among the records made in that call. Linear's `projects` mapping: a board is a Linear project, a status is a **team** workflow state, `Priority` is built in, rules are the team's auto-archive and auto-close (read-only, off is a `todo`).
- **Syncing issues** (`holocron sync issues --from <a> --to <b> [--since] [--yes]`, `commands/sync-issues/`, SPEC-0071 section 4, #1859). One direction of a sync; the other direction is the same command with the ends swapped, and the two never share state. `runSyncIssues()` reuses `parseEndpoint`, `openSide` (its `command` names the command in a missing-plugin error), `collectRecords` and `tallyDropped` from `migrate`, reads the source with `export` (`IssueSelector.since` narrows it; `parseSince()` turns `--since` into an ISO time), drops every record with `IssueRecord.migratedFrom` set (the loop guard: the `holocron:migrated-from` marker on GitHub, a `Migrated from` attachment on Linear), and hands the rest to the optional `Issues.sync(records, options)`, which returns `SyncResult`s (an `ImportResult` plus `updated` and `changes`). `sync` is `import` plus updates: a record not yet made goes through the plugin's create path (GitHub `createFromRecord()`, Linear `importIssues()` with its `results` out-parameter), and one found through its recorded address has title, description, state, priority, labels and assignee set to the source's when they differ, and the comments it lacks added (found again by their time, so a comment edited on the source is not copied twice; none is edited or deleted). A rate limit (`isRateLimited()` in each plugin) makes `sync` return the records done; the command counts the rest as `left`. A write that did not go through is not repeated in the run. The target's assignee is matched by email (Linear only; GitHub keeps none) and a source with no assignee leaves the target's alone. `sync issues` sits beside `sync github`; a schedule (reusable workflow plus thin caller) is a follow-up. The Linear client reads `attachments` of an issue for the guard.
- **Ideas vault** (`holocron sync ideas [--dry-run] [--yes]`, `commands/sync-ideas/`, SPEC-0072, #1994, #2022). The `ideas` capability (single, optional, `Ideas` / `IdeaRecord` in `capabilities.type.ts`: `list`, `setStatus`, `markFiled`, optional `retire`) holds where ideas are kept; `plugins/holocron-plugin-obsidian` implements it over a folder of Markdown notes (files only: no token, no network, so no `auth.ts`; `ObsidianIdeas`, a `listNotes()` that skips `_` and `.` folders, `parseNote()`, `writeProperty()` for `status:`/`issue:` byte for byte, `resolveIdeasDir()` with `HOLOCRON_IDEAS_DIR` over the `dir` option over `vault` (a name in iCloud Drive, `ICLOUD_VAULTS_ROOT`; one folder name, else a `ConfigError`) and `~` expanded; the key is the path relative to `dir`; `retire` is not implemented, Obsidian's trash is the app's). `IdeaRecord.error` is the one addition to the spec's record: a note the provider could not read, reported as a failing row. The CLI keeps `runIdeasSync()`, a `workspace` command: `resolveIdeasProvider()` takes `providers.ideas` first, else the deprecated `ideas.dir` (or `HOLOCRON_IDEAS_DIR` alone) as `["obsidian", { dir }]`, with no change to the resolved config; it loads only that provider to read (so `--dry-run` never builds the `issues` loader), and for each idea whose `status` is `ideas.states.file` (default `in-progress`, still validated by `validateIdeas()`) with no `issue` calls `Issues.create` (title the first `#` heading, else the file name; body the text without frontmatter plus `Filed from idea: <title>`), then `Ideas.markFiled()` (which reads the note again, then writes). An idea with attachments (`![[...]]` of a file or note, a local `![](...)`) is a skipped row. Only ideas to file and ideas needing attention get a row; the rest are counted. The body ends with a hidden `<!-- holocron:idea <key> -->` line, and before creating, one `Issues.search({ text: <marker> })` per note about to be filed (only a note in the filing state with no `issue`) looks for it, and the returned issue's body must contain the exact marker, so a rerun reuses the issue (`already filed as`); a search that throws is a failing row for that note only and creates nothing for it; after a create one more search settles overlapping runs (`convergeCreatedIssue()`: the oldest open issue wins, the other run comments on and closes its own, and the note gets the winner's key even if that cleanup fails; `pickCanonicalIssue()`, `oldestIssueKey()`). GitHub's search pages up to 2000 recently updated issues, so an issue older than that is still missed, and each search spends rate limit. Rows go through `printCheckRows`; it asks first unless `--dry-run`/`--yes`; never deletes; a failure is a row, and a created issue whose `markFiled` fails is reported with the key. The org's `holocron_capabilities` must allow `ideas` (`holocron apply properties`) before a repo declares it. The in-app Obsidian plugin is `apps/council` (#2016, part 2): File this idea sets the filing state, runs `holocron sync ideas --yes` on desktop only (`HOLOCRON_IDEAS_DIR` from the vault, cwd the configured checkout, no token anywhere in the plugin), re-reads the note and moves it to Obsidian's trash only when it now has an `issue:`; the decisions are pure functions in `filing/` and `frontmatter/`, the Obsidian calls are a thin layer in `main.ts`, and `child_process` is required lazily so the plugin loads on iOS. `holocron new spec <issue> [--name] [--dry-run] [--yes]` (`commands/new-spec/`, #2017, `workspace`) is the spec-time step: `runIdeasPromote()` reads the issue with `Issues.get` (the provider parses `#1234`/`1234`/`RANDO-7`), `specName()` makes `tech-<kebab title>` (conventional-commit prefix and emoji stripped, or `--name` whole), and `buildSpec()` writes `status: draft`, `issue:` (`owner/repo#N` from the issue's url, else `org/name`; a Linear key as is), `blocked-by: []`, no `id`, and the body under `## Problem` less the `Filed from idea:` line and the marker; any issue is allowed and the row says whether it carried the marker; it never overwrites (`wx`), never edits the issue or touches the vault, reads and writes through an injected `PromoteIo`, and asks first unless `--dry-run`/`--yes`. Discord and a schedule are later parts and not built.
- **Doctor** (`holocron doctor`, epic #1162, spec `tech-doctor-deep-checks`). `doctor` is the shallow smoke check;
  `doctor <capability>` is a deep, read-only comparison of what the config declares with what exists, one row per
  step, non-zero exit on a failure. Every deep check is an entry in `DEEP_CHECKS`
  (`cli/cli/src/commands/deep-checks/`) and prints through the shared pieces in `@theholocron/kyber/ui` (`printCheckRows`,
  `printCheckSummary`, `summariseChecks`, `declaredVsActual`), so a new one is a list of comparisons, not a renderer. A new entry also
  needs `COMMAND_CONTEXTS` and `COMMAND_REGISTRY` entries; `deep-checks.test.ts` fails without them. Checks that write
  and read back are probes, not doctor. `doctor variable-owners` (#2041, spec `tech-doctor-variable-owners`) reports a
  variable name held by two places (1Password Environments, Actions secrets and variables), names only (the Environments are listed by a `readCredentials: false` loader, the GitHub reads by a second loader that has the credential chain for the token); the `repo.*.sync`
  fan-out, `doctor.sharedVariables` and the `githubApps` instances are not findings. `doctor ci` (#1689) needs no provider: it checks the repo against the flat task
  vocabulary (deprecated aliases in `tasks:`, caller file/workflow/job names, the `ci` aggregate's `expected`, the
  callers' home), reading `.github/workflows` through an injected `CiIo`; the ruleset stays `doctor repo`'s.
  `doctor logs` compares the Axiom datasets the setup ships logs to with Axiom (`datasetTargets()`: the CLI's through the
  logger's own `resolveCliDataset()`, Sentinel's `SENTINEL_AXIOM_DATASET`, any other `dev.serve.logging.datasetVar`) through the
  optional `Logs.readDataset` (`exists`, `retentionDays`) and `Logs.checkToken`: only a 404 on a dataset and a 401 on the token
  fail, a name, token or response that cannot be read is a skip, retention is an `info` row (ADR-0019), and nothing is created
  or printed beyond names and numbers.
  `doctor github-app` (#1851) compares each `githubApps` entry (`{ name, manifest, environment }`, this repo's two Sentinel
  instances) with its manifest file: the App's id and key are read in memory from the vault environment (`Vault.readEnvironment`,
  never printed), `getApp()` and `listAppInstallations()` of `@theholocron/github-client` read the live App with its JWT, and a
  gap ends with the settings page that fixes it. An instance whose credentials cannot be read is a skip, not a failure.
  `doctor shared-values` (#2089, spec `tech-doctor-shared-values`) reads each layer's Environment (`<org/repo> - local|dev|ci|prod`) in memory (optional `Vault.readEnvironmentEntries`, which carries `concealed`) and reports by name, one `info` row per pair of layers (`--strict` fails), the concealed secrets that share a value, compared by a per-run salted hash that is never printed, and `info` rows for `ci` variables missing from or different in `dev`; `doctor.sharedVariables` and `--allow` leave out names shared on purpose.
- **Plugin packages** are named `@theholocron/holocron-plugin-<provider>`.
  Each follows the proven template: `auth.ts` + `rest.ts` (or `shell.ts`
  for CLI-transport) + `capabilities/<key>.ts` + `index.ts` exporting
  `createPlugin()`.
- **Task manifest → `@theholocron/astromech`** (ADR-0009, epic #581). One
  `tasks` array in `holocron.config` drives every workflow surface:
  `holocron run` / `holocron run ci`, each repo's `.github/workflows/*.yml`
  thin callers (`astromech.thinCallers()`, consumed by `holocron sync` /
  `holocron setup`), `package.json` scripts, the linter set, the
  branch-protection required checks (in holocron: `ci / Required checks` and `DCO`, #1613), and the reusable `workflow_call`
  implementations pushed to `theholocron/.github`
  (`astromech.reusableTemplates()`, consumed by `holocron sync github`; their
  source files are in `ci/`, the `@theholocron/ci` package).
  The sources are grouped by suite: `ci/workflows/<suite>/<leaf>.yml`, or `ci/workflows/<id>.yml` for a leaf in no suite.
  `idFromSource()` (path to task id: `test/unit.yml` is `test:unit`) and `workflowFile()` (id to the flat generated
  file: `test-unit.yml`) are the only place that mapping lives, exported from `@theholocron/ci` and `@theholocron/astromech`
  (spec `ci-flat-task-vocabulary`, #1619). The reusables a repo contains are written to `.github/workflows` under the flat
  names; the frozen copies in `theholocron/.github` keep the old ones, so a caller of another repo is written with
  `legacyFile()` (and `localize` goes back with `flatFile()`) until `CI_HOME` moves to `ci-v1`. The caller files, workflow
  names and check names did not change.
  This repo's own copy of a reusable runs the `codecov-upload` composite action from its checkout (`./ci/actions/codecov-upload`, `localizeActions()` in `hostedReusableFile()`), because the action in `theholocron/.github` is a frozen copy that `holocron sync github` no longer updates: a change to the action takes effect on the PR that makes it. The Codecov test-results uploads (`report_type: test_results`, test analytics no required status reads) use `fail_ci_if_error: false`, so a Codecov outage there is logged and does not fail `test:unit`; the coverage uploads still fail the job. The other actions are still the frozen copies until `CI_HOME` moves to `ci-v1`.
  Root `package.json` scripts and `turbo.json` come from one function, `scriptsFor()` (spec `ci-flat-task-vocabulary`,
  #1616): in a pnpm workspace each script calls turbo directly (`"test": "turbo run test"`, because the `holocron` bin is
  built from this repo and does not exist on a fresh clone), a repo-scoped leaf holds its tool's own command, a suite
  (`test`, `lint`, `scan`) is a script-less aggregator task in `turbo.json`, and a repo-scoped suite leaf is a `//#<id>`
  root task; a single package uses `holocron run <words> --`. A package's leaf script holds the real tool command and never
  calls turbo or `holocron run`, and no package has a script named like a suite or an npm lifecycle word.
  `holocron sync` writes the scripts (`syncScripts` is on here) and `holocron probe generated check` fails on a root
  script that differs and on a package script that breaks those rules. That includes a script named by a task id's hyphen spelling (`deploy-preview`, where the script spelling is
  `deploy:preview`): `holocron run` looks the script up by the script spelling, so it would skip the task as "enforced in
  CI" (#1929). Unit tests always run with coverage (the `test:unit`
  command carries `--coverage`; there is no flag). Until a repo rewrites `tasks:` to flat ids, its turbo keys and package
  scripts keep the old dotted names the entries are spelled with (`taskKey()`).
  A thin caller's workflow `name:`, job `name:` and file are the task id (#1620): `test:unit` is `name: test:unit`, the job `test-unit` and, in holocron, the file `ci.test-unit.yml` (the `ci.` prefix keeps it from clashing with the reusable `test-unit.yml` beside it), so its check is `test:unit / Conclusion` and the `ci` aggregate waits for it by the prefix `test:unit /`. Another repo's callers keep the names they had (`verification.unitTests.yml`, `name: Verification`, job `test`) while `CI_HOME` points at the frozen reusables in `theholocron/.github` (`legacyGate()` in astromech, `legacyCaller()` over the `LEGACY_CALLERS` table): its ruleset still lists those checks. Moving `CI_HOME` to `ci-v1` opens the gate and drops the table.
  The loop closes both ways: the reusable workflows (`typecheck`, `test-unit`, `lint-code`, …) run
  their core step through the `holocron` composite action
  (`holocron run <task> [job]`), so CI executes the same command a
  contributor runs locally.
  A `deploy` task with `with: { on: "release" }` in a workspace
  package's `holocron.config` is a release-time deploy (#930): the shared
  `release` workflow's separate `deploy` job runs `holocron
deploy-on-release` (`deployOnRelease()` in astromech) after the release job,
  and it generates no workflow of its own.
  The workflows read a few organization Actions variables (`vars.HOLOCRON_TURBO_TEAM`, `vars.HOLOCRON_CLOUDFLARE_ACCOUNT_ID`, …; each is read as `vars.HOLOCRON_X || vars.X` and mapped onto the bare name a tool such as turbo or wrangler reads, #1864). They
  are declared under `repo.variables` and written by `holocron setup`, or, for this repo, filled from the `ci` layer's 1Password Environment by `holocron sync secrets ci` (`repo.variables.sync`), never set by hand. A
  missing one fails quietly, so the templates warn and say where it is declared: the shared `setup` composite action
  when `TURBO_TOKEN` (mapped from `secrets.HOLOCRON_TURBO_TOKEN || secrets.TURBO_TOKEN`, as `SENTRY_AUTH_TOKEN` is from `HOLOCRON_SENTRY_RELEASE_TOKEN`, #1711) is set without `TURBO_TEAM`, and `preview.yml` (deploy and cleanup) when a Pages project is
  configured without `CLOUDFLARE_ACCOUNT_ID`. Account-specific values deliberately have no default in the templates.
  **`theholocron/.github` and `.github-private` are pure sync targets** —
  their `.github/workflows/*`, `.github/actions/*` and `workflow-templates/*`
  are generated from `cli/astromech/src/templates/` and pushed by
  `holocron sync github`; edit the source here, never those repos directly.
- **The `ci` aggregate check** (#1613, spec `ci-flat-task-vocabulary`, epic #1612). One stable required check: the
  reusable `ci/workflows/ci.yml` has one job, `Required checks` (called from the caller job `ci`, so the context is `ci / Required checks`), that polls the Checks API for the PR's head commit until every
  `expected` id has a check run named `<id> / ...` and has completed, and every `statuses` entry (the `codecov/`
  extras) reached `success`, or 30 minutes pass; an id that never posted fails. Only the newest run of each check name counts (latest `started_at`, then `id`), so a cancelled first batch or a job that failed and was re-run to green does not hold the aggregate red (#2171). `aggregateChecks()` derives both
  inputs from the same list the ruleset used to take (`required: true` tasks, then `extraRequiredChecks`, using
  the names the checks post) and `aggregateCaller()` renders the thin caller, written as `ci.ci.yml` only in the repo that contains
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
  (`probe specs check`) and `validate:docs` (`probe docs validate`), each with its own reusable workflow, caller and
  check (`validate:specs / Validate ADRs and specs`, `validate:docs / Validate docs`), and a third,
  package-scoped leaf with no workflow, `validate:plugin` (the plugins' own script). The sub-job mechanism (`jobs:`,
  `retiredJobs`, the `Conclusion` aggregator) is gone (#1622). `validate` and `platform.repoValidation` in a `tasks:` list <!-- holocron-allow-old-name -->
  are aliases for both leaves (`workflowKeys()` writes one caller each; a repo still on the legacy gate gets the one
  `platform.repoValidation.yml` caller, which the frozen reusable answers for both). `RESERVED_SCRIPT_NAMES`
  and `PNPM_BUILTIN_COMMANDS` list the npm lifecycle words no task may take and the pnpm built-ins that need
  `pnpm run <script>`. `measure` is the fifth suite (#2070): `measure:docs` (`probe docs coverage`, the `documentation`
  Codecov flag) and `measure:bundle` (the bundle upload), each with its own reusable (`measure-docs.yml`,
  `measure-bundle.yml`, sources `ci/workflows/measure/`), caller and check (`measure:docs / Measure documentation
coverage`, `measure:bundle / Upload bundle stats to Codecov`). The hyphen ids `measure-docs` and `measure-bundle` are <!-- holocron-allow-old-name -->
  deprecated aliases in `LEGACY_NAMES` (the `tasks:` notice applies; they generate the same files, and `isLegacySpelling()`
  treats them as the flat ids since their script spelling is the same); the legacy gate keeps the old caller names
  through `LEGACY_CALLERS`, now keyed by the colon ids.
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
    (`pickMenuItem` / `searchChoices`, `promptForPositionals`, `promptForOptions`) live in
    `@theholocron/kyber/prompts`, which has no knowledge of commands, and `NonInteractiveError` (with the rest of the
    terminal output helpers and the cleaning of error text) in `@theholocron/kyber/ui`; code imports both from kyber
    directly, the CLI has no `ui/` directory of its own, and the retry notice on the spinner is kyber's
    `createRetryNotice(onRetry)`, registered once in `cli.ts` with `setProgressListener`;
    `interactive-menu/` holds the rest, one folder per piece:
    `command-catalog` (kyber's `createCommandRegistry` over the Holocron entries), `run-menu-entries` and `probe-menu-entries`, plus `menu.ts`
    (kyber's `createMenu` bound to the `holocron` bin).
    A `MenuEntry` can also declare `options` (spec
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
    of independent flags — `publish package`'s steady-state publish /
    `--initial` bootstrap / `--sync-trust` maintenance mode, which `when`
    alone could only approximate by silently dropping a contingent pick
    after the fact — declare `modes` instead of `options`: the user picks
    one workflow first ("What would you like to do?"), and only that
    mode's own options are ever shown, so nothing contingent on a different
    mode is ever offered in the first place. `publish package` is the
    first (and, so far, only) command that needs `modes`; every other
    command with options declares plain `options`. `promptForOptions`
    returns a `ResolvedOptions` (`{ options, answers, deferred }`) either
    way — `buildChildArgv`/`secretEnv` render both shapes identically,
    with no need to know which kind of command produced it. An option
    marked `askLast: true` (e.g. `publish package`'s `--otp`) is left out
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
    deferred). `publish package`'s `--otp` is `askLast: true` always,
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
  as a dependency, so `holocron setup` writes a name-only `ignore` entry
  (`.github/dependabot.yml`, never edited by hand) for each workspace package
  that a catalog lists. Security updates are not affected. To raise a floor,
  edit its line in `pnpm-workspace.yaml` by hand, in the PR that needs the newer
  version, then run `pnpm install`.
  In a repo that contains the reusables (`hostsReusables()`), the github-actions entry also watches `/ci/workflows`, `/ci/workflows/*` and `/ci/actions/*` (`sources` in `createDependabot()`), so a pin bump reaches the generator sources and not only the `.github/workflows` copies; otherwise `validate:generated` fails on every action bump. Whether Dependabot reads workflow files from those paths is taken from reports, not its documentation: if a PR bumps only `.github/workflows`, copy the pins into the sources by hand.
  The same file sets `labels: [dependencies]` on both update entries, so Dependabot adds no ecosystem label
  (`javascript`, `github_actions`), which `setup` removes as stale (#1967).

`holocron probe deps report` (`pnpm deps`) prints every dependency with its
range and how widely it is used; `holocron probe deps who <name>` lists the
packages that use a dependency, by group; `holocron probe deps check`
(`pnpm deps:check`) fails on a hard-coded version, a workspace package pinned
to a version, a dependency in the wrong catalog or an unused catalog entry.
They read the manifests and `pnpm-workspace.yaml` live on each run (nothing is
cached), from the built CLI (`pnpm build` first). Run the check after adding or
moving a dependency; CI runs it on every pull request as the required check
`validate:deps / Check dependency catalogs` (the `validate:deps` task, `.github/workflows/ci.validate-deps.yml`).

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
  `astromech`, `datapad`, `dagobah`, `kyber`, and `apps/sentinel`), exported
  `interface` / `type` declarations live in `<name>.type.ts`, not in the
  implementation file. A module sits in a folder named after it, holding the
  implementation, its test and, when it declares types, the type file
  (`commands/auth/auth.ts`, `auth.type.ts`, `auth.test.ts`). Types shared by
  several functions in one folder stay in that folder's own `*.type.ts`
  (`commands/publish/publish.type.ts`). Each such folder has an `index.ts`
  barrel that re-exports the implementation and the types
  (`export * from "./auth.js"; export type * from "./auth.type.js";`), and code
  outside the folder imports through it (`../commands/auth/index.js`); files
  inside the folder import their siblings directly. The `config/`
  and `plugin/` directories also have a root `index.ts` that re-exports
  their folders, and code outside the directory imports through it
  (`../config/index.js`). `config/` and `plugin/` import each other, so between
  those two the specific folder barrels are used (`config/config/index.js`,
  or the `config/config-system.js` file for `defineConfig`/`loadConfig`/`compose`);
  going through both root barrels would create a runtime import cycle. `src/index.ts` keeps its own
  curated exports and does not use the root barrels. Modules with no types
  still get their own folder (implementation, test, `index.ts`) so a directory is
  consistently folders; no empty `*.type.ts`. In `astromech`, `config/` and
  `lint/` keep their curated public `index.ts` (the `./config` and `./lint`
  subpath exports), `tasks/run/index.ts` stays curated too, and
  `templates/` keeps its one-folder-per-generator layout beside the template
  data files that the build turns into strings.
- **No third-party observability / telemetry SDK is imported in this repo.**
  `pino`, `@sentry/node`, `posthog-node` (and, for a browser or edge runtime, `@sentry/browser`, `@sentry/vercel-edge`,
  `posthog-js`, behind `/browser/*` and `/edge/*`, one subpath per adapter; the `/react-native` sinks take the vendor SDK as an injected dependency and import none, so they add no call site) live behind
  `@theholocron/observability` — the `Logger` / `ErrorSink` / `AnalyticsSink`
  interfaces (with `Noop*` for the opted-out / no-credentials path) come from
  `@theholocron/observability/core`; the `PinoLogger` / `SentrySink` /
  `PostHogSink` adapters — the sole vendor call sites — from
  `/logger`, `/errors`, `/analytics`. `git grep -nE "from \"(@sentry/node|posthog-node|pino)\"" cli/ plugins/
apps/` must return **nothing** (source). The CLI's
  orchestration lives in `@theholocron/kyber/observability`
  (`createCliLogger`, `createCliTelemetry`); the CLI's `observability/` is the thin Holocron binding (`logger.ts`,
  `telemetry.ts`) plus `observability/resolve-telemetry.ts` (the Holocron-specific DSN / key resolution, the
  keyring lookup, which stay here). A vendor swap or a
  test fake is one file — in `observability/`.
- **Read env through `@theholocron/env-utils/lookup`, never the package entry.** The entry also exports `DotenvLoader`, whose
  module runs `import "dotenv/config"` and so loads the working directory's `.env` into `process.env` on import. `/lookup` has
  `createEnvLookup`, `firstEnv` and `withEnvPrefix` with no side effects; the root ESLint config forbids the bare import
  (`no-restricted-imports`, #1640).
- **Non-token values go through the same chain as tokens: `resolveValue(names, env?)`** (`@theholocron/kyber/secrets`, re-exported by `@theholocron/cli`). It is the environment, then the `credentials` providers' variables, so a plain value (the Cloudflare account id) held in a 1Password Environment reaches a plugin with no `process.env` copy. `resolveValue(names, env?, { prefix })` builds the `<prefix>_<name>` then bare `<name>` pair for each name, so a caller passes `PREFIX` (`@theholocron/env-utils/lookup`, `"HOLOCRON"`) instead of listing both. The Cloudflare plugin reads `CLOUDFLARE_ACCOUNT_ID` as `accountId` option, then `resolveValue`. A plugin's `src` (non-test) reads other environment variables through `createEnvLookup` / `firstEnv` from `@theholocron/env-utils/lookup`, never `process.env`; the `noProcessEnv` config exported by the root `eslint.config.ts` (added to every `plugins/*/eslint.config.ts`) enforces it.
- **A variable Holocron owns is `HOLOCRON_<NAME>`, with the bare `<NAME>` kept as a fallback** (#1864). `PREFIX` and `holocronEnv(source?)` (`@theholocron/env-utils/lookup`) are the one definition and the one lookup; a name a third party reads itself (`GITHUB_TOKEN`, `CI`, `NO_UPDATE_NOTIFIER`) stays bare. The list of every variable, by group, is `docs/src/content/docs/environment-variables.mdx`. `cli/cli/src/env-prefix-guard` fails the CLI's tests when source reads a bare name that is not owned by a prefix, not in its allowlist (`env-allowlist.ts`: third-party names, and `RELEASE_GROUP`, the one group 1 name still deferred until the template repos move) and not read through the prefix helper. Sentinel's own bindings use `SENTINEL_<NAME>` first with the bare name as the fallback (`SENTINEL_GITHUB_APP_ID`, `SENTINEL_AXIOM_DATASET`). One owner per variable (#1672): `SENTINEL_<NAME>` (`COMLINK_<NAME>`) names the app whose own Environment holds the variable's source of truth, not its only reader (`doctor github-app` and a workflow read copies), so a synced Actions secret or variable of the same name stays as it was until `holocron sync secrets` runs for the Environment that feeds it (sometimes a second entry to change as well), and an app never gets a copy of a CLI credential under the CLI's name; a name specific to the organization that several things read (`HOLOCRON_DISCORD_BOT_TOKEN`, `HOLOCRON_USER_SYNC_TOKEN`, `HOLOCRON_AXIOM_ORG`, `HOLOCRON_ENVIRONMENT`) stays `HOLOCRON_<NAME>` and shared on purpose, though the value of `HOLOCRON_ENVIRONMENT` is set per deployment; Comlink's `COMLINK_<SOURCE>_WEBHOOK` is no Environment value (`setup notifications` writes it to the Worker); a bare name stays only where a tool reads it itself.
- **One definition of the environment names and of CI detection: `@theholocron/env-utils/lookup`** (`ENVIRONMENTS`, `environment`, `detectEnvironment()`, `isCI()`; `local | development | ci | test | production`, with `dev`, `prod`, `stage`, `staging` and `qa` read as aliases). The observability logger binds `detectEnvironment()` as `env` on every line, `detectEnvironment()` reads `HOLOCRON_ENVIRONMENT` and then `ENVIRONMENT`, and `holocron dev` hands its application both as `development`, and Sentinel's scripts read their settings through `createEnvLookup()`, not `process.env`. Do not write a second list of the names or a second CI check.
- **Adapter pattern for new vendors.** New plugins use the
  `/holocron-skill-plugin` skill at `.claude/skills/holocron-skill-plugin/`. The
  skill produces ~14 files in the right shape; only the capability
  method bodies need to be filled in (REST calls / shell-outs).
- **REST clients (`rest.ts`):** bearer auth + `accept: application/json`
  headers, transport-failure wrapping (`ProviderApiError` with
  `status: 0` for a `TypeError` thrown by `fetch`, and so on). Always returns
  `undefined` on 204 or when `expectNoContent: true`. A client opts in to
  sending a read again on a transient HTTP status with `retryStatuses` (the
  Cloudflare client does, for 500/502/503/504); a write is never repeated.
- **CLI-transport clients (`shell.ts`):** `spawnSync` wrapper with
  `stdio: ['inherit', 'pipe', 'pipe']` (the inherit stdin matters —
  it gives the vendor CLI a TTY signal so biometric / interactive
  prompts work locally; CI sees no TTY and behaves accordingly).
- **Soft-skip over hard-fail when a capability fails.** Orchestrator
  commands (`setup`, `sync secrets`, `doctor`) wrap each step in
  `try/catch` and continue; final summary reports `ok / fail / skip`
  counts. Per-step failure does not abort the run.
- **Idempotent capability operations.** Probe-then-act, treat
  "already exists" / 409 / EPRECONDITION as success, never break
  on re-runs.
- **A generated file is the same bytes whichever command writes it, and passes the repo's own formatting check.**
  `holocron setup` and `holocron sync` both write the thin-caller workflows and `turbo.json`; running
  either on an up-to-date checkout must leave `git diff` empty. So: a file both commands write goes through one
  function (`thinCallerFile()` in `cli/cli/src/commands/thin-caller-file/`, whose header names `holocron sync`
  for either command); a generator that writes JSON uses `formatJson()` (`cli/astromech/src/utils/format-json/`),
  which lays the file out the way Prettier does (an array that fits in 120 columns stays on one line), not
  `JSON.stringify`; and a managed block (`.gitignore` skills) lists its entries in the configured order, not the
  order the installs happened to finish in. A test for a new generated file should check Prettier leaves it as it is.
  The files `setup` writes from the config alone come from `generateRepoFiles()`
  (`cli/cli/src/commands/repo-files/`), which needs no provider: `setup` writes what it returns through the
  source, `sync` takes its workflows and `turbo.json` from the same functions, and `holocron probe generated
check` (`pnpm exec holocron probe generated check`, the required check `validate:generated / Check generated files`) generates them
  twice and fails on a file that differs from the committed copy. A new file `setup` writes belongs in that
  function, not in `run-setup.ts`; one that needs the provider (CODEOWNERS) stays in `run-setup.ts`. A workflow
  that is not generated carries `# HAND-MAINTAINED` on its first line. The check also generates the thin callers of
  every workspace package with a `holocron.config.*` of its own (`apps/sentinel`; `generatePackageWorkflows()` in
  `probe/generated/`, the same `generateWorkflowFiles()` `sync --cwd <package>` uses) and compares them the same
  way, so a package's `paths:` list cannot go stale unseen; a failure names the package. A file the root and a package
  both generate is checked once, as the root's, and shown as an `info` row.
- **The org agent instructions live in `.holocron/org.md`** (the one copy; the CLI embeds it at build time). This file
  imports it with `@.holocron/org.md`. Every other repo gets it as a generated block between
  markers in its `AGENTS.md`, written by `holocron sync` (the `agents` step, `generateAgentFiles()` in
  `repo-files/`) and checked by `holocron probe generated check`; the rest of that file is the repo's own. Edit the
  org rules in `.holocron/org.md`, never in a repo's block. `theholocron/.github-private/AGENTS.md` is the old home and
  stays until every consumer is repointed (#1217, #1229).
- **`holocron.config.json` is the contract.** No hardcoded vendor
  lists, no hardcoded paths, no implicit assumptions. Config drives
  loader; loader drives commands.

## Workflow

- **Discuss → `.notes/<topic>.spec.md` → issue.** Non-trivial
  decisions get a spec file in `.notes/` before acting. Lifecycle:
  `draft → proposed → accepted → archived` (or `superseded`). Spec name
  prefixes: `tech-` / `tool-` / `process-` / `ci-` / `security-`.
  Once the design is settled the spec **moves to
  `docs/wiki/specifications/`** (`accepted` for living reference docs,
  `archived`/`superseded` for shipped or dropped work); `.notes/` holds
  only in-progress specs. `holocron probe specs check` checks both dirs.
- **File issues for non-trivial work** and reference in commits/PRs
  (`Closes #N` / `Refs #N`). File the issue and write the spec first, in the
  tracker the config's `issues` provider names (GitHub when none is set), with
  `holocron new issue` (#2134) rather than a tracker's own CLI, and
  reference it in that tracker's syntax (`Closes ENG-42` for Linear). Cross-check against `.notes/*.spec.md`
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
- **`holocron upgrade node` pattern registry.** When you introduce a
  new file type that pins the Node.js version (e.g., a new CI platform's
  config, an `.engines` file, a custom script), add a `Pattern` entry to
  the `PATTERNS` array in
  `cli/astromech/src/upgrade/upgrade-node/upgrade-node.ts` (`@theholocron/astromech/upgrade`; the CLI command
  only binds its logger) — a `matches` predicate
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
  `ENEEDAUTH`. A renamed entry needs `holocron publish package --sync-trust`.
- **First publish for a new package** uses `holocron publish package --initial`
  (chicken-and-egg: trusted publishing needs the package to exist
  first). The command runs `npm login --auth-type=web` itself when
  `npm whoami` shows no session. Workflow: `pnpm install && pnpm build`
  → `pnpm --filter @theholocron/cli run start:source publish package --initial --otp <code>`. `start:source` runs
  the CLI from source through `tsx`, with `src/source-run/register.ts` preloaded so the source can import `.holocron/org.md`
  (the build inlines it with `transformTemplate`; the hook reuses that plugin; Node 22.15+). It is used because a fresh
  clone has neither `tsx` nor a `holocron` bin at the root until a second `pnpm install` after the build.
  Self-narrowing: it checks every publicly publishable package against the
  npm registry (existence, not version) and only targets the ones that
  don't exist on npm yet — re-running it after adding one new package to an
  already-bootstrapped monorepo only publishes that one, not all of them
  again. Nothing new to bootstrap is a success, not a failure.

## Repo layout

<!-- prettier-ignore -->
```text
cli/                              — core infrastructure (the CLI and its runtime)
  cli/                            — @theholocron/cli                       (binary + runtime + 22 capability interfaces)
  astromech/                      — @theholocron/astromech                 (task runner: holocron run / ci, thin callers, package scripts, linters, required checks, reusable workflows — ADR-0009, epic #581)
  datapad/                        — @theholocron/datapad                   (generic holocron.config loader — ADR-0010)
  dagobah/                        — @theholocron/dagobah                   (the local dev server behind `holocron dev serve` — env loading, a loopback handler server, request logging, and `superviseProcesses()`, the two-process foreground supervisor behind `holocron dev`, and the GitHub App manifest flow behind `holocron new github-app`; a published dependency of the CLI, #1714)
  kyber/                          — @theholocron/kyber                     (the reusable parts of a CLI, all twelve subpaths moved — terminal output (`/ui`), the update notifier (`/notifier`) and token handling (`/secrets`: owner-only files, shredding, git-ignore check, dotenv, clipboard, keyring, credential store, `--token` parsing) prompts (`/prompts`: the searchable menu and the positional and option prompts) the test harness (`/testing`: `createCliRunner`, `runCommand`, `ensureBuilt`, `hermeticCreateRequire`) the logger and telemetry orchestration (`/observability`: `createCliLogger`, `createCliTelemetry`; `@theholocron/observability` is an optional peer) the plugin loader (`/plugins`: `createPluginSystem` builds a typed single/many capability registry from a package prefix and a config's providers; the CLI's `PluginLoader` binds it and passes in the Holocron prefix, plugin options and the credentials / `.env` preload step) and the global flags (`/flags`: `addGlobalOptions` declares `--dry-run`, `--token` and `--cwd`; `tokenContext`, `groupMenu`, `InferArgs`), HTTP checks and the connection probe (`/checks`: `runCheckAgainstUrl`, `connectionProbe`) and the major-tag mover (`/git`: `moveMajorTag`, `runGit`); a published dependency of the CLI that a new CLI can import, spec `tech-kyber`, #1727)
apps/                             — deployable applications (not published to npm; private, version 0.0.0 — deployed, not versioned: the deploy-on-release job deploys the commit, and their changes land in the root CHANGELOG)
  council/                        — @theholocron/council                  (private Obsidian plugin for the ideas vault: File this idea and Set idea status; builds to dist/main.js + manifest.json, installed by hand, #2016)
  sentinel/                       — @theholocron/sentinel                  (minimal GitHub App — webhook receiver, scaffolding only, docs/wiki/specifications/tech-sentinel-v1.spec.md)
observability/                    — @theholocron/observability             (logging, errors and analytics behind one interface; releases on its own version line, tags `observability-v*`)
skills/                           — @theholocron/skills                    (shared agent skill registry; releases on its own version line, tags `skills-v*`)
clients/                          — @theholocron/*-client                  (21 API clients: axiom, checkly, clerk, cloudflare, confluence, discord, doppler, github, google, http, infisical, jira, linear, neon, netlify, posthog, postman, sentry, slack, vercel and zendesk; release on their own version line, tags `clients-v*`)
utils/                            — @theholocron/*-utils                   (13 small libraries: array, date-time, env, fs, git, json, location, misc, object, pkg, storage, string and uri utils; release on their own version line, tags `utils-v*`)
configs/                          — @theholocron/*-config                  (17 shareable config packages: eslint, prettier, tsconfig, vitest, tsdown, commitlint, ...; release on their own version line, tags `configs-v*`)
themes/                           — @theholocron/docs-theme                (the Starlight docs theme the templates and `astro-config` use; releases on its own version line, tags `themes-v*`)
plugins/                          — vendor capability providers, one package per provider (split from cli/ as the count grew)
  holocron-plugin-github/         — source / ci / secrets / environments / issues
  holocron-plugin-linear/         — issues / projects (+ export and import for `holocron migrate`)
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
  holocron-plugin-obsidian/       — ideas (files only: no token, no network)
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
  folder is a release group); run `holocron sync` to add its codecov flag and component.
- **`skills/`** needs no rules of its own: a new skill is a `src/<name>/SKILL.md` (use `holocron-skill-skill`), a row in
  the README table and a `feat:` commit; the unit test fails on a folder with no `SKILL.md`.
