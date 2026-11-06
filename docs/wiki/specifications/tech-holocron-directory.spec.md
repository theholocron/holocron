---
id: SPEC-0069
status: accepted
issue: theholocron/holocron#1747
blocked-by: []
related:
  - theholocron/holocron#1820
  - theholocron/holocron#1744
  - theholocron/holocron#1098
  - theholocron/holocron#493
  - theholocron/holocron#1727
discussion:
  url: https://discord.com/channels/1303969001822486568/1568082129575743518
---

# `.holocron/`: a directory for the big declarations

This is the living reference for the `.holocron/` directory: what it is, how the CLI and Sentinel read it, and what
stays out of it. It began as a proposal (epic #1747) and now records the decisions as built. Where the build differs
from the first draft, the section says so. The user-facing shape is in `cli/cli/README.md` ("The `.holocron/`
directory"); the architecture note is in `AGENTS.md`.

## Problem

`holocron.config.ts` was 426 lines, and most of them were two declarations, not choices:

| Section                                                         | Lines             | Size |
| --------------------------------------------------------------- | ----------------- | ---- |
| `providers.notifications` (the Discord server layout)           | 189 to 415        | ~227 |
| `repo` (teams, topics, `defaultBranch`, `variables`, `secrets`) | 32 to 101         | ~70  |
| `tasks`                                                         | 134 to 160        | ~27  |
| `extraRequiredChecks` and `repoValidation`                      | 114 to 133        | ~20  |
| the other providers (`credentials`, `vault`, `errors`, ...)     | 161 to 188, 416ff | ~40  |

(Line numbers are from before the move.) A reader who wanted to know which provider does what had to scroll past a
Discord server. About a sixth of the notifications block (37 of 227 lines) was comments that explain why a choice was
made, so whatever form the layout took had to keep comments; that is why `.ts` is the format here (question 5).

SPEC-0020 (`.notes/command-project.spec.md`, "Template system") had already put project-board templates in files, one
`<name>.json` per template, in `.holocron/projects`. That is built: `DEFAULT_TEMPLATES_DIR = ".holocron/projects"` in
`cli/cli/src/commands/project/project-options/project-options.ts`, read by `createFsTemplatesIo()`. This spec made the
directory the general rule for the big declarations.

## What the code did before

- **Discovery.** `createConfigSystem().loadConfig()` (`cli/kyber/src/config/create-config-system/`) calls datapad's
  `loadConfigFile({ cwd, name, walkUp: true })`, then `derive(found)`, then `resolve(raw)`. Extension priority is
  `ts, js, mjs, cjs, json` (`DEFAULT_EXTENSIONS`, `cli/datapad/src/default-extensions/`).
- **Precedent for a second file.** `astromech.config.ts` sits beside `holocron.config.ts` (ADR-0009, ADR-0010) and
  Sentinel fetches it too (`loadDedicatedTasks()`).
- **Precedent for a file named by a config.** `pinned: [{ channel, file }]`, resolved by `resolvePinnedFiles()` through
  `readRepoText()`, which refuses an absolute path, a `..` and a link that leaves the repo, and caps the size at 100 KB.
  Setting both `content` and `file` is an error (`tech-discord-channel-content`, SPEC-0061).
- **Validation.** `resolveConfig()` runs on the whole merged object, so anything placed before `resolve` is validated
  like inline config, which is what "a move, not a rewrite" needs.

## What shipped

| Layer         | What it does                                                                                                                                                                                                               | PR                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| datapad       | `loadConfigDir()` (disk), `readConfigDirSource()` (remote probe per area), `writeConfigDir()` (the sandbox writer; keeps relative paths so an area may import a sibling). The directory and the area names are parameters. | #1796               |
| kyber         | `createConfigSystem` takes optional `areas` and `place(areas, raw)`, called after `loadConfigFile` and before `derive`. The directory is `.<name>`.                                                                        | #1796               |
| CLI           | `HOLOCRON_AREAS` (`notifications`, `repo`) and `placeAreas()`: where each lands, and the both-set error. Both are exported from `@theholocron/cli` for Sentinel.                                                           | #1796               |
| github-client | `git.listDirectory()`: a directory through the Contents API, recursive.                                                                                                                                                    | #1797               |
| Sentinel      | `validateConfig()` lists `.holocron/` at the config's `ref`, fetches the tree within caps, writes it with `writeConfigDir()`, then `loadConfigDir()` and `placeAreas()`.                                                   | #1798               |
| This repo     | `.holocron/notifications.ts`, `.holocron/repo.ts`, `.holocron/pinned/rules.md`, `.holocron/media/webhook-avatar.png`.                                                                                                      | #1799, #1800, #1801 |

## Decisions as built

### 1. A convention, not only `import`

A `holocron.config.ts` can `import` a helper module and the config is run through `tsx`, so a split into modules needs
no loader change. What the convention adds:

1. **Data, not code, for repos that cannot import.** `holocron.config.json` has no `import`; the area files are found by
   name with no reference at all (question 3).
2. **One place the CLI looks by name**, so a tool can open one area without evaluating the whole config (which imports
   `@theholocron/astromech`, calls `readWorkspacePackages()` and the preset).
3. **One place a new area goes**, and one rule for generated versus hand-written files.
4. **Sentinel visibility** (below).

A `.ts` config may still import its own helpers; Sentinel evaluates only what the config or an area file imports.

### 2. How Sentinel loads a config, and what it does with `.holocron/`

Before: `validateConfig()` fetched `holocron.config.*` (one probe per extension through `git.getContents`) and the
`astromech.config.*` layer, wrote each body to a temp directory (`withConfigSandbox()`), and loaded it with the same
loader the CLI uses. What reads the result: the PR config check, `syncPropertiesFromConfig()` (`repo.properties` and
`repo.protection`, default branch only) and role sync (`providers.notifications`). A config that depended on a file in
`.holocron/` would have loaded with `status: "load-error"` or silently without its layout, so no area could move before
Sentinel learned the directory.

As built (#1797, #1798), and **different from the first draft** (a fixed list of area names, no sibling imports):

- Sentinel **lists the directory and fetches the tree** at the same `ref` as the config (`git.listDirectory`,
  recursive; `fetchConfigDir()`), writes it with `writeConfigDir()` before the config is evaluated, then loads the area
  files with `loadConfigDir()` and places them with the CLI's own `placeAreas()`. The returned `config` is the merged
  one, so role sync, property sync and the PR check see what the CLI sees. A new area needs no Sentinel change.
- **An area file may import a sibling** in `.holocron/` (the whole tree is written to the sandbox). It may also import
  packages, which resolve through the `node_modules` symlink. Only what the config or an area file imports is
  evaluated: a stray file does nothing.
- **Caps** (the tree comes from a repo others can write to): at most 50 files, 100 KB per file (the cap of
  `readRepoText()`), 512 KB in all. Symlinks and submodules are skipped. Past a cap, or when an area file does not load
  or conflicts with an inline value, the result is `load-error`. A repo with no `.holocron/` (the listing 404s)
  behaves as before; any other GitHub failure propagates.
- The D4/D6 boundary is unchanged: a `ref` read is for validation only, and everything that writes stays on the
  default branch.

### 3. `holocron.config.json` repos

`.github` and `.github-private` have no `package.json`, so no `import` and no `holocron.config.ts`. A JSON config cannot
name a file, which is why the convention works with no reference at all: `.holocron/notifications.json` and
`.holocron/repo.json` are found by name. The loader supports this (`.json` is the last entry of `DEFAULT_EXTENSIONS`),
and it is covered by the loader's tests. **No json-config repo has adopted it**: those configs are too small to show
anything, so the adoption is proved in this repo's own config instead (#1806, PR #1807). JSON has no comments, which is
acceptable for small configs. Typing for `.json` files (a `$schema`) is the one carried-forward question (open question
3).

### 4. Where the loader lives

Datapad stays holocron-agnostic ("no schema, no validation, no defaults", ADR-0010): the directory name and the area
names are parameters, and it does not decide what an area means. Kyber's `createConfigSystem` gives a second CLI the same
convention through `areas` and `place`. The CLI owns what is holocron-specific: the area names, where each lands in
`HolocronConfig`, and the both-set error. Sentinel depends on datapad and imports `placeAreas` and `HOLOCRON_AREAS`
from the CLI, so the two cannot disagree.

### 5. Areas, formats, and how the config refers to them

| Area                             | File                                 | Format                                    | Referred to by                                                                               | State                  |
| -------------------------------- | ------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------- |
| Project templates                | `.holocron/projects/<name>.json`     | `.json` (fixed by SPEC-0020)              | convention, plus the `templates` provider option for a different folder                      | built before this epic |
| Notifications layout             | `.holocron/notifications.{ts,json}`  | `.ts` here, `.json` in content-only repos | convention: fills the `layout` of the `providers.notifications` entry, which keeps `guildId` | moved (#1799)          |
| `repo` block                     | `.holocron/repo.{ts,json}`           | same                                      | convention: supplies keys of `repo`; a key set inline and in the file is an error            | moved (#1800)          |
| Pinned message files             | `.holocron/pinned/rules.md`          | Markdown                                  | explicit path, `file: ".holocron/pinned/rules.md"`                                           | moved (#1801)          |
| Webhook avatar                   | `.holocron/media/webhook-avatar.png` | binary                                    | explicit path, `webhookAvatar`                                                               | moved (#1801)          |
| Org constants                    | `.holocron/org.{ts,json}`            | same                                      | convention: fills provider options a config leaves out (section 5a)                          | added (#1820)          |
| `tasks`                          | stays                                | n/a                                       | n/a                                                                                          | no                     |
| `providers` (others)             | stays                                | n/a                                       | n/a                                                                                          | no                     |
| `dev`, `doctor`, `log`, `skills` | stay                                 | n/a                                       | n/a                                                                                          | no                     |

- **Format.** `.ts` keeps the comments that carry the layout's reasoning; datapad's priority order prefers `.ts` over
  `.json` when an area has both. The loader accepts both for every area, so the choice is per repo. There is **no
  `defineLayout()` helper** (the first draft proposed one): a file uses `export default { ... } satisfies
NotificationsLayout` (or `RepoConfig`) with a type-only import, so nothing is added to the public API and a file
  Sentinel evaluates pulls in no runtime code from `@theholocron/cli`.
- **Reference.** By convention for the two area files; the list is closed in the CLI (`HOLOCRON_AREAS`), so a file not on
  it is never read. Paths a layout names (`pinned.file`, `webhookAvatar`) stay explicit repo-relative paths, validated
  by `readRepoText()` as before.
- **Both set is an error.** If a value is set inline and in an area file, `placeAreas()` throws a `ConfigError` naming
  both places (`the notifications layout is set in providers.notifications and in .holocron/notifications.ts`,
  `repo.topics is set in the config and in .holocron/repo.json`). **There is no merge and no precedence.** The first draft
  said "inline keys win per key, as `compose` does"; that is not what was built.
- **What stays inline.** `tasks`, because Sentinel validates them against the registry on every PR and they already have
  a second home (`astromech.config.ts`); the other providers, which are the "index of choices"; and in `repo`:
  `defaultBranch`, `protection` and `properties`. `defaultBranch` must be inline because the config is the one file read
  before the directory, and the default branch says which branch holds both. `protection` and `properties` come from the
  preset spread, and a key set both inline and in the file is an error, so they stay inline too (`syncPropertiesFromConfig()`
  reads them from the merged result). This repo's `.holocron/repo.ts` holds `teams`, `topics`, `variables` and `secrets`.
  Nothing else is needed before `.holocron/` is read: `validateConfig()` reads no `org`, `name` or other key from the
  config first (it needs only the config's path and the `ref`).
- **No secrets in the directory.** `repo.secrets.sync` lists names only and `variables` lists identifiers only; the
  directory is public in a public repo.
- **`.holocron/projects`** (SPEC-0020) is not in `HOLOCRON_AREAS`: it is a directory of files one per template, read by
  `createFsTemplatesIo()` from its own default, not an area placed into the config.

### 5a. The `org` area (#1820)

Some provider options are not choices of one config but constants of the organization: the Vercel `teamId`, the Checkly
`accountId`. They were literals inside provider tuples, repeated wherever a config used the provider.

- **File.** `.holocron/org.ts` (or `.json`): `{ cloudflare: { accountId }, vercel: { teamId }, checkly: { accountId } }`,
  typed `satisfies OrgConfig` (type-only import). One file per area.
- **Name.** `org`, as asked. There is no collision with `.holocron/org.md` (the org agent contract the CLI embeds):
  `loadConfigDir()` builds the path from the area name plus an extension from `DEFAULT_EXTENSIONS` (`ts, js, mjs, cjs,
json`), so `org.md` is never read as an area, and `org.ts` is not read as the contract. A test covers `org.md` beside
  `org.ts`.
- **Fill when absent.** `placeOrg()` (next to `placeRepo()`, called from `placeAreas()` before `deriveDefaults`) gives
  each provider entry that names a listed provider (a bare name, a tuple, or either in a list, under any capability) the
  options it leaves out. A provider the config does not use is ignored.
- **Both set is an error.** An option set inline and in the area is a `ConfigError` naming both
  (`vercel.teamId is set in providers.deployment and in .holocron/org.ts`). No merge, no precedence.
- **Closed list.** A provider key or option the area does not know is a `ConfigError`, so a typo cannot silently do
  nothing; a new provider option is a one-line addition to `OrgConfig` and the table in `placeOrg()`.
- **Location.** A config reads the `.holocron/` beside it (kyber uses the directory of the config file it found), and,
  for the shared areas, the repository root's too (#1829). Only `org` is shared (`SHARED_AREAS`); `repo` and
  `notifications` describe the repository, and a root `notifications` layout would be an error for an app with no
  notifications provider. datapad's `loadConfigDir({ shared })` finds the root (the nearest `.git`), returns the config's
  own file with the root's as `root` (or the root's file alone, its `path` relative to the config), and `placeOrg()`
  combines them option by option: the config's own file wins, and a key set in both is not an error. An option set
  inline and in either file stays a `ConfigError` naming that file. The root `.holocron/org.ts` holds the Checkly id once;
  `apps/sentinel/.holocron/org.ts` holds only Sentinel's Vercel `teamId`. A repo whose config is at its root inherits
  nothing. Sentinel's remote loader reads a repo's root config and the `.holocron/` beside it, where the directory is
  the root, so it passes no `shared` list and is unchanged.
- **What stays out: anything CI needs.** A value CI needs lives in 1Password and syncs to a GitHub variable
  (`repo.variables.sync`), and nothing else carries a copy. So `CLOUDFLARE_ACCOUNT_ID`, `TURBO_TEAM` and `AXIOM_DATASET`
  are not in this area. The Cloudflare `accountId` literals (Sentinel's tunnels, Comlink, the `wiki` and `docs`
  presets, and the `CLOUDFLARE_ACCOUNT_ID` constant of `presets/constants.ts`) are gone (#1827): the Cloudflare plugin
  reads `CLOUDFLARE_ACCOUNT_ID` through `resolveValue` (the environment, then the `credentials` providers' variables).
  The Environment `Holocron - GitHub Actions variables` is a `credentials` entry of the root config and of Sentinel's
  and Comlink's configs, each of which has a vault of its own and so needs the entry to reach the id.
  `cloudflare.accountId` is still accepted by the area, but nothing sets it.
- **Moved.** The Vercel `teamId` and the Checkly `accountId` of `apps/sentinel/holocron.config.ts`, and the Checkly
  `accountId` of the root `holocron.config.ts`. The resolved config of Sentinel equals the pre-move snapshot
  (`load-config-org-area.test.ts`), also after #1829 removed Sentinel's own copy of the Checkly id.
- **Follow-ups.** Whether a provider's own options should declare which of them are org constants instead of a table in
  the CLI. (The Cloudflare `accountId` through the credential chain is done, #1827, and so is the area shared by app
  configs and the root config, #1829.)

### 6. Generated and hand-written files

Nothing in `.holocron/` is generated, and that rule is kept: the area files are the maintainer's input, and
`holocron repo sync` and `generateRepoFiles()` write only outputs. Every file in `.holocron/` is hand-written.
`probe generated check` compares only files `generateRepoFiles()` returns, so it needs no rule for this directory. If a
generated area file is ever added (a layout read back from a live server, a template saved by `project template save`),
the proposal is a generated-header marker that `repo sync` honours: write only a file that carries it or does not
exist. That is not built and not needed now. The files pass the repo's formatter and `lint:data` / editorconfig like any
other file.

### 7. Migration

A move: the same values, the same `HolocronConfig` types, the same `resolveConfig()`. No back-compat layer for this
repo's config: the inline `layout` is gone, but the CLI still accepts an inline `layout` for other repos, since "both set
is an error" needs it. The check for a move is mechanical: the resolved config before and after is compared with
`toEqual` against a fixture of the old inline text (`load-config-layout-move.test.ts`, `load-config-repo-move.test.ts`,
`load-config-pinned-move.test.ts`).

| Phase | Change                                                                                                   | PR (issue)                   | Status                                                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | Decisions accepted; the project-board templates in `.holocron/projects` (#1744) exist.                   | #1775, #1790                 | done (specs merged; #1744's template reading is built, the issue itself is still open)                                                                                                     |
| 1     | datapad `loadConfigDir` / `readConfigDirSource` / `writeConfigDir`; kyber `areas` and `place`; CLI areas | #1796 (#1783)                | open PR, not merged                                                                                                                                                                        |
| 2a    | github-client lists a directory                                                                          | #1797 (#1784)                | open PR, not merged                                                                                                                                                                        |
| 2b    | Sentinel fetches the `.holocron/` tree                                                                   | #1798 (#1785)                | open PR, not merged. **Not done until it is deployed:** it must run on the Sentinel dev instance, and a real PR's config check must pass there, before #1799 merges. That is a human step. |
| 3     | Move the notifications layout into `.holocron/notifications.ts`                                          | #1799 (#1786)                | open PR, not merged; gated on 2b                                                                                                                                                           |
| 4     | Move the `repo` block (except `defaultBranch`, `protection`, `properties`) into `.holocron/repo.ts`      | #1800 (#1787)                | open PR, not merged                                                                                                                                                                        |
| 5     | `RULES.md` to `.holocron/pinned/rules.md`; the avatar to `.holocron/media/webhook-avatar.png`            | #1801 (#1788)                | open PR, not merged                                                                                                                                                                        |
| 6     | Prove the adoption in this repo's own config; move this spec here as `accepted`                          | #1807 (#1806); #1802 (#1789) | open PRs. #1807 lands before #1802. The json-config adoption this phase first named was dropped (question 3).                                                                              |

Nothing here is "shipped" until the PRs merge and, for phases 3 to 5, the Sentinel deploy gate has been passed by a human.

### 8. Prior art

ESLint flat config is a single `eslint.config.js` that imports and composes, with no directory convention at all: the
"plain imports" answer, and how this repo's `configs/` packages already work. Renovate keeps a short `renovate.json`
that `extends` named presets, found by name: a short index plus a named, fetchable unit, the closest match to the
Sentinel requirement. Changesets uses `.changeset/config.json` plus one Markdown file per pending change, read by the
tool: the precedent for `.holocron/projects`. A short index plus fixed, named units is what a remote reader can fetch
without running code; tools that allow code in the units (ESLint) have no remote readers, which is Sentinel's problem
here, and why the caps and the "only what is imported is evaluated" rule exist.

## Where the build differs from the first draft

| First draft                                            | As built                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Sentinel probes a fixed list of area names             | Sentinel lists the directory and fetches the tree, with caps (#1797, #1798)                               |
| An area file must not import a sibling                 | An area file may import a sibling; the whole tree is written to the sandbox                               |
| Inline keys win per key, as `compose` does             | A key set inline and in a file is a `ConfigError`; no merge, no precedence                                |
| A typed `defineLayout()` helper                        | No helper: `export default {...} satisfies NotificationsLayout`, a type-only import                       |
| `repo.defaultBranch` is the one key that never moves   | `defaultBranch`, `protection` and `properties` stay inline (the preset spread; the duplicate rule)        |
| `RULES.md` and the avatar: optional, phase 5           | Moved into `.holocron/` (#1801), as the epic decided                                                      |
| A json-config repo adopts `.holocron/*.json` (phase 6) | Dropped; this repo's own config is the proof (#1806, #1807)                                               |
| "Archive the spec" at the end                          | The spec is `accepted`: it is a living reference for a convention in force, not a record of finished work |

## Open questions

1. **Directory listing or a fixed list of areas for Sentinel?** Resolved: the listing (#1797, #1798). The client change
   was small, and it removes the sibling-import limit and any per-area Sentinel change.
2. **Keys that never move.** Resolved (#1787, #1800; see section 5): `repo.defaultBranch`, plus `protection` and
   `properties` from the preset, stay inline. `holocron config show` lists the moved keys after `defaultBranch` instead of
   around it (same data, one key in a different place).
3. **A JSON Schema of `HolocronConfig`** (for `$schema` in `.holocron/*.json`). **Carried forward**: not decided and not
   built. It would be the typing story for json-config repos, and needs its own issue; the proposed text is in the pull
   request that moved this spec (#1802).
4. **Does `tsc` or ESLint see `.holocron/*.ts`?** Resolved (#1786, #1799): no. The root `tsconfig.json` has
   `"files": []` and references only `./cli/cli`, and `lint:code` / `typecheck` run per workspace package, so neither
   `holocron.config.ts` nor `.holocron/*.ts` is checked by them (ESLint lints a dot-directory when named; `tsc` accepts
   the file with a root-level tsconfig). knip covers it (root `entry` and `project` list `.holocron/*.ts`). Wiring root
   `//#lint:code` and `//#typecheck` tasks is a CI-gate change left for the maintainer.
5. **Is `.holocron/` right for `RULES.md`?** Resolved (#1788, #1801): yes, it moved to `.holocron/pinned/rules.md`. GitHub
   no longer renders it in the root file list, a visibility trade-off the maintainer accepted in the epic (#1747).
6. **Name for the type helper.** Resolved (#1786, #1799): no helper; `satisfies <Type>` with a type-only import.
7. **Where the avatar goes.** Resolved (#1788, #1801): `.holocron/media/webhook-avatar.png`. `media/` is shared (the
   `--sound` MP3s and its README live there), so only the avatar moved.
8. **How is the move proved, and what keeps the config short?** Resolved (#1806, #1807).
   `cli/cli/src/config/load-config-self-adoption.test.ts` loads this repo's own `holocron.config.ts` through the real
   loader: the raw export has no `layout` and none of `teams`/`topics`/`variables`/`secrets` (so it fails if one is put
   back inline), the loaded config takes them from `.holocron/`, and the whole resolved config equals
   `holocron-self-adoption.pre-move.snapshot.json`, the resolution of the config before #1786. `holocron-config-size.test.ts`
   fails above 200 lines (it was 426, it is 154). The deploy gate is a human runbook (`AGENTS.md`, "`.holocron/` area
   files"): #1786 merges only after Sentinel with #1785 runs on the dev instance and a real PR's config check passed there.
