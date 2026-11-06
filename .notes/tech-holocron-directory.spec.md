---
id: SPEC-0069
status: proposed
issue: theholocron/holocron#1747
blocked-by:
  - theholocron/holocron#1744
related:
  - theholocron/holocron#1744
  - theholocron/holocron#1098
  - theholocron/holocron#493
  - theholocron/holocron#1727
discussion:
  url: https://discord.com/channels/1303969001822486568/1568082129575743518
---

# `.holocron/`: a directory for the big declarations

## Problem

`holocron.config.ts` is 426 lines, and most of them are two declarations, not choices:

| Section                                                         | Lines             | Size |
| --------------------------------------------------------------- | ----------------- | ---- |
| `providers.notifications` (the Discord server layout)           | 189 to 415        | ~227 |
| `repo` (teams, topics, `defaultBranch`, `variables`, `secrets`) | 32 to 101         | ~70  |
| `tasks`                                                         | 134 to 160        | ~27  |
| `extraRequiredChecks` and `repoValidation`                      | 114 to 133        | ~20  |
| the other providers (`credentials`, `vault`, `errors`, ...)     | 161 to 188, 416ff | ~40  |

A reader who wants to know which provider does what has to scroll past a Discord server. About a sixth of the
notifications block (37 of 227 lines) is comments that explain why a choice was made, so whatever form the layout takes next must keep
comments (decided: see Decisions).

SPEC-0020 (`.notes/command-project.spec.md`, "Template system") already put project-board templates in files, one
`<name>.json` per template, in `.holocron/projects`. That is built: `DEFAULT_TEMPLATES_DIR = ".holocron/projects"` in
`cli/cli/src/commands/project/project-options/project-options.ts`, read by `createFsTemplatesIo()`. So the directory
exists by convention for one area, and nothing else knows about it. This spec decides whether it becomes the general
rule, and how.

## What the code does today

- **Discovery.** `createConfigSystem().loadConfig()` (`cli/kyber/src/config/create-config-system/`) calls datapad's
  `loadConfigFile({ cwd, name, walkUp: true })`, then `derive(found)` (async, receives `{ config, filepath }`), then
  `resolve(raw)`. Holocron's `derive` is `deriveDefaults` (`cli/cli/src/config/load-config/derive-defaults/`).
  Extension priority is `ts, js, mjs, cjs, json` (`DEFAULT_EXTENSIONS`, `cli/datapad/src/default-extensions/`).
  `derive` is the one existing seam that runs after discovery and before validation, and it already knows where the
  config is.
- **Precedent for a second file.** `astromech.config.ts` sits beside `holocron.config.ts`; `loadLayered` /
  `loadTasksConfig` merge it (ADR-0009, ADR-0010), and Sentinel fetches it too (`loadDedicatedTasks()` in
  `apps/sentinel/src/utils/validate-config/validate-config.ts`). Tasks of this repo are therefore already split across
  two files; the 27 lines in the table are only part of them.
- **Precedent for a file named by a config.** `pinned: [{ channel, file }]` in the layout (`holocron.config.ts` line
  352, `{ channel: "rules", file: "RULES.md" }`), resolved by `resolvePinnedFiles()` through `readRepoText()`, which
  refuses an absolute path, a `..` and a link that leaves the repo, and caps the size at 100 KB. Setting both `content`
  and `file` is an error (spec `tech-discord-channel-content`, SPEC-0061). `webhookAvatar: "media/webhook-avatar.png"` is
  the same kind of loose input.
- **Validation.** `resolveConfig()` (`cli/cli/src/config/config/config.ts`) runs on the whole merged object. Anything
  that arrives before `resolve` is validated the same way as inline config, which is what "a move, not a rewrite" needs.

## Questions and recommendations

### 1. What does a convention add over plain `import`?

A `holocron.config.ts` can already `import { layout } from "./.holocron/notifications.js"`, and the config is run
through `tsx`, so a split into modules needs no loader change. For this repo alone, part of the issue is only that:
a tidy-up. What a convention adds beyond imports:

1. **Data, not code, for repos that cannot import.** `holocron.config.json` has no `import` (question 3).
2. **One place the CLI looks by name.** Commands that need one area (`notifications setup`, `project reconcile`,
   `doctor notifications`) and tools that never evaluate the config can open `.holocron/notifications.*` without
   running the whole config, which imports `@theholocron/astromech`, calls `readWorkspacePackages()` and the preset.
3. **One place a new area goes**, and one rule for generated-versus-handwritten (question 6).
4. **Sentinel visibility on its own terms** (question 2): Sentinel can list and fetch a directory tree, which a bare
   `import` graph cannot give it.

Plain modules are enough for: splitting the `repo` block and the notifications layout out of this one config for
readability. They are not enough for the json-config repos and for Sentinel.

**Recommendation:** adopt the convention, because (1) and (4) are real. Say plainly in the README that a `.ts` config
may still import its own helpers, but only the area files below are seen by Sentinel and by json-config repos.

### 2. How Sentinel loads a config today, and what it does with a `.holocron/` file

Trace (`apps/sentinel/src/utils/validate-config/validate-config.ts`):

1. `validateConfig({ client, repo, ref })` builds `fetchRepoFile`, which calls `client.git.getContents(repo, path, ref)`
   (`clients/github-client/src/git/git.ts`) and returns `undefined` on a 404. `ref` is omitted for the default branch
   (the D4/D6 boundary stated in the file's header: a ref read is for validation only, never for anything that writes).
2. `readConfigSource({ name: "holocron", fetch })` (`cli/datapad/src/read-config-source/`) probes
   `holocron.config.ts`, `.js`, `.mjs`, `.cjs`, `.json` in order, one request each, and returns the first body.
3. `withConfigSandbox()` makes a temp directory with `node_modules` symlinked to Sentinel's own and a
   `package.json` of `{"type":"module"}`.
4. `loadConfigFromContent()` writes that one body to `<tmp>/holocron.config.<ext>` and loads it with the same `loadFile`
   the CLI uses. The `astromech.config.*` layer is fetched and written the same way (`loadDedicatedTasks()`).
5. The merged `tasks` are checked against `KNOWN_TASKS` / `KNOWN_WORKFLOWS`.

What reads the result: the PR config check (`pr-config-validation`), `syncPropertiesFromConfig()` (`repo.properties` and
`repo.protection`, default branch only), and role sync, which takes `providers.notifications` from
`validated.config` and builds the Discord provider from its options
(`load-role-sync-providers.ts`). **So the notifications layout and the `repo` block are the two areas Sentinel
reads, and they are the two areas this issue moves first.**

With a `.holocron/` file today: only one file is written to the temp directory. A config that imports
`./.holocron/notifications.js` loads with `status: "load-error"` (module not found), the PR check reports it, and role
sync answers "has no usable holocron config". A config that relies on convention with no import loads, but the layout
is absent, and role sync says "declares no notifications provider". Neither is silent breakage of the merged
result, but both turn a working repo into a not-working one. Moving the first area without teaching Sentinel is wrong.

Design for Sentinel (decided: list the directory and fetch the tree):

- A new datapad function reads the `.holocron/` tree the way `readConfigSource` reads the config: it lists the
  directory through the same GitHub Contents API, fetches each file it finds (recursing into subfolders such as
  `projects/`, `pinned/` and `media/`), and writes the bodies to `<tmp>/.holocron/` beside the config.
  `loadConfigFromContent` is unchanged. This needs a **client change first**: `getContents` is typed for one file,
  and a directory path returns an array. The change is a typed directory listing (or `getTree` with `recursive`, which
  the client has) that returns the entries, with `ProviderApiError` handling for a 404 (no `.holocron/` is fine).
- **Because Sentinel receives the whole tree, an area file may import a sibling** by relative path. The earlier
  restriction ("packages only") is dropped. What stays bounded: the number of files, each file's size (the 100 KB cap
  of `readRepoText()`), and the total size. Sentinel still evaluates only what the config or an area file imports; a
  stray file in `.holocron/` is written to the sandbox but never run.
- A binary file (the avatar) is fetched as base64 like any other body; it counts toward the total cap.
- JSON area files are the safer ones for Sentinel: Sentinel today executes the default branch's config as code in its
  own process (the D4/D6 trust is "same org, default branch"), and a `.json` area adds no new code to run. That is a
  small point for `.json`, not a reason to give up `.ts` comments (decided: `.ts` here, see Decisions).
- The 100 KB cap of `readRepoText()` should apply to area files, too.

### 3. `holocron.config.json` repos

`.github` and `.github-private` have no `package.json`, so no `import` and no `holocron.config.ts` (`AGENTS.md`,
"`holocron.config` format"). They need the data-file form, and a JSON config cannot name a file with an import, so
**the convention must work with no reference at all**: `.holocron/notifications.json` and `.holocron/repo.json`,
found by name, placed at a fixed key. This is the strongest argument for convention over imports.

For the loader, `.json` is already the last entry of `DEFAULT_EXTENSIONS`, and `JSON.parse` is all datapad does for it,
so the same probe covers them. JSON has no comments. For a content-only repo that is acceptable (their configs are
small); a `$schema` pointing at a generated JSON Schema of `HolocronConfig` would give editors typing and is a later,
separate decision (open question 2).

### 4. Where the loader lives

Datapad is documented as holocron-agnostic: "no schema, no validation, no defaults" (`loadConfigFile` doc comment;
ADR-0010 "What it does not know"). Kyber's `createConfigSystem` is the generic config system a CLI builds on and
already calls datapad. Holocron-specific knowledge (which keys the areas fill, merge order, the error wording) is the
CLI's. `@theholocron/kyber` did move config discovery out of the CLI: `cli/cli/src/config/config-system.ts` now calls
`createConfigSystem` from `@theholocron/kyber/config`, and `cli/cli/src/config/compose/` uses its merge strategies.

**Recommendation, a split along the existing line:**

- **datapad** (generic): `readConfigDirSource({ dir, areas, fetch })` and `loadConfigDir({ cwd, dir, areas })`, which
  return `{ area, path, extension, content | value }` for each area present; plus the Sentinel-side counterpart that writes
  them into a sandbox. The directory name and the list of area names are parameters, not constants. Datapad
  does not decide what an area means.
- **kyber** `createConfigSystem`: an optional `areas` option and an `place(areas, raw)` callback, called inside
  `loadConfig` after `loadConfigFile` and before `derive`, so a second CLI gets the same convention.
- **CLI** (holocron-specific): the area names (`notifications`, `repo`, `projects`), where each lands in `HolocronConfig`,
  and the rule "inline and file both set is an error" (the `pinned` precedent).

This is a datapad function and a CLI decision, and not "the CLI's alone": Sentinel needs the same function and
already depends on datapad, not on the CLI's config module.

### 5. Which areas move, in what order, and how the config refers to them

| Area                             | File                                 | Format                                           | Referred to by                                                                            | Moves             |
| -------------------------------- | ------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------- |
| Project templates                | `.holocron/projects/<name>.json`     | `.json` (fixed by SPEC-0020)                     | convention, plus the existing `templates` provider option for a different folder          | done              |
| Notifications layout             | `.holocron/notifications.{ts,json}`  | `.ts` here (37 comment lines), `.json` elsewhere | convention: fills `providers.notifications[1].layout`; the provider entry keeps `guildId` | phase 3           |
| `repo` block                     | `.holocron/repo.{ts,json}`           | same                                             | convention: merged under inline `repo` (inline keys win per key, as `compose` does)       | phase 4           |
| Pinned message files             | `.holocron/pinned/rules.md`          | Markdown                                         | explicit path, `file: ".holocron/pinned/rules.md"` (value change only)                    | phase 5 (decided) |
| Webhook avatar                   | `.holocron/media/webhook-avatar.png` | binary                                           | explicit path (value change only)                                                         | phase 5 (decided) |
| `tasks`                          | stays                                | n/a                                              | n/a                                                                                       | no                |
| `providers` (others)             | stays                                | n/a                                              | n/a                                                                                       | no                |
| `dev`, `doctor`, `log`, `skills` | stay                                 | n/a                                              | n/a                                                                                       | no                |

Reasons:

- **Format.** The notifications layout carries its reasoning in comments, so for this repo `.ts` with a typed
  `defineLayout()` (an identity helper, like `defineConfig`) is right; datapad's priority order already prefers `.ts`
  over `.json`. JSON is the form for json-config repos and for anything a tool writes (project templates). The loader
  accepts both for every area, so the choice is per repo, not per area.
- **Reference.** By convention for the two big areas, because question 3 requires it. The convention is fixed, not
  scanned: the area names are a closed list in the CLI. For paths of files a layout names (`pinned.file`,
  `webhookAvatar`), the reference stays an explicit repo-relative path, validated by `readRepoText()` as today: it is an
  input of the layout, not an area.
- **Both set.** If `providers.notifications` already has an inline `layout` and `.holocron/notifications.*` exists,
  that is an error naming both, as `pinned` does for `content` + `file`. No merge, no precedence to remember.
- **`tasks` stay** because Sentinel validates them against the registry on every PR, the thin callers and
  `scriptsFor()` read them, they are 27 lines, and they already have a second home (`astromech.config.ts`). A third
  place would make the manifest less clear, not easier. **Other providers stay**: they are the "index of choices"
  the issue wants left behind.
- **`repo` carries one trap.** `repo.defaultBranch: "alpha"` is what makes Sentinel read the right branch. It must stay
  in `holocron.config.ts`; Sentinel needs it before it can know which branch to read `.holocron/` from. Put it on the
  list of keys that never move (open question 1).
- **Never put secrets in the directory.** `repo.secrets.sync` lists names only and `variables` lists identifiers only;
  that stays true, and the directory is public in a public repo.

### 6. Generated and hand-written files

Nothing in `.holocron/` is generated today, and the recommendation is to keep it that way for the areas above: they are
the maintainer's input, and `holocron repo sync` and `generateRepoFiles()` (`cli/cli/src/commands/repo-files/`) write
only outputs. Rules:

- **Every file in `.holocron/` is hand-written unless it starts with the generated header.** `createHeader()` (astromech)
  already produces the `# Source package:` / `workflowHeader()` text for workflows; a generated area file would carry the
  same marker (a `//` line for `.ts`, a `"$generated"` key for `.json`, where a comment cannot go). `repo sync` writes only
  a file that carries the marker or does not exist; anything else is skipped with a note, never overwritten.
- `probe generated check` (`checkGenerated()` in `cli/cli/src/commands/probe/generated/`) compares only files
  that `generateRepoFiles()` returns, so a hand-written area file is not in its scope. It needs no new rule until a
  generated area file exists. Today's `# HAND-MAINTAINED` first-line marker is for workflows; for `.holocron/` the
  default is "hand-written" with no marker, so a missing marker is not a finding.
- A generated file would be, for example, a layout that `notifications import` reads back from a live server, or a
  template saved by `project template save`. Neither exists. Do not design for them now; the rule above is enough to
  allow them later.
- The files must pass the repo's formatter, as the AGENTS.md rule says about generated files: Prettier for `.ts` and
  `.json`, and `lint:data` / editorconfig check them as they check any file. A new test should check Prettier leaves a
  written `.holocron/*.json` unchanged, only if a writer is added.

### 7. Migration

A move: the same values, the same `HolocronConfig` types, the same `resolveConfig()`. No back-compat layer and no
fallback (single maintainer): after phase 3 the inline `layout` in this repo is gone, but the CLI still accepts an
inline `layout` for other repos, since "both set is an error" needs it.

| Phase | Change                                                                                                                                                                                                                                                             | What it proves                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 0     | Decisions in this spec accepted; SPEC-0020's project board work (#1744) merged.                                                                                                                                                                                    | The first user of the directory is real before it is generalised.                                |
| 1     | datapad: `readConfigDirSource` / `loadConfigDir` and the sandbox writer. kyber: `areas` and `place`. CLI: `.holocron/` areas read in `deriveDefaults`' seam, no area file present yet.                                                                             | Loading is generic; with no files, nothing changes (`config show` is byte-identical).            |
| 2     | github-client: a typed directory listing. Sentinel: `validateConfig` lists `.holocron/`, fetches the tree within the caps and writes it to the sandbox. Tests: a repo with and without `.holocron/`, a 404, a sibling import, a file over the cap, a `load-error`. | Sentinel sees an area file before any real config depends on it. Land and deploy before phase 3. |
| 3     | Move the notifications layout into `.holocron/notifications.ts`. `config show` output equal before and after; `doctor notifications` and role sync unchanged.                                                                                                      | Same values, same types; role sync (Sentinel) still reads the layout from the default branch.    |
| 4     | Move the `repo` block (except `defaultBranch`) into `.holocron/repo.ts`. `probe generated check` empty; `syncPropertiesFromConfig` unchanged.                                                                                                                      | The second area needs no loader change; the `compose` merge rule holds.                          |
| 5     | Move `RULES.md` and the webhook avatar under `.holocron/` (decided). A one-line path change each, after checking that nothing else uses the avatar's current folder.                                                                                               | Nothing new in the CLI; only that the paths are repo-relative as before.                         |
| 6     | A json-config repo (`.github-private`) adopts `.holocron/*.json` if it has anything to move.                                                                                                                                                                       | The data-file form works with no `package.json`.                                                 |

Each phase is one PR with its own tests and docs (`cli/cli/README.md` for the config shape, `AGENTS.md` for the
architecture note, and this spec moving to `docs/wiki/specifications/` at the end). The check for a move is
mechanical: load the old and the new config and compare the resolved object with `toEqual`; add that as a test in
phase 3 and 4, with the old inline text as the fixture.

### 8. Prior art

ESLint flat config is a single `eslint.config.js` that imports and composes, with no directory convention at all, so it
is the "plain imports" answer and is how this repo's `configs/` packages already work. Renovate keeps a short
`renovate.json` that `extends` named presets, found by name (`config:recommended`, `github>org/repo//path`): a short
index plus a named, fetchable unit, which is the closest match to the Sentinel requirement. Changesets uses
`.changeset/config.json` plus one Markdown file per pending change, and the tool, not the user, reads the directory:
that is "a directory of data owned by a tool" and gives the precedent for `.holocron/projects`. Lessons that inform
this: a short index plus fixed, named units is what a remote reader can fetch without running code; and the tools that
allow code in the units (ESLint) have no remote readers, which is Sentinel's problem here.

## Contradictions and corrections to the issue

- The issue says `tasks` is "about 30" lines; `tasks` is 27 lines in `holocron.config.ts` (134 to 160), but this repo's
  task manifest is also in `astromech.config.ts`, so the issue's number understates how spread out it already is.
- The issue says the layout is "lines 189 to 416". The `notifications` entry runs from line 189 to line 415 on
  `alpha` at `HEAD`; PR #1770 is editing the file now, so the numbers will drift.
- The issue lists `providers` as "probably stays". It does, but one provider's options (`notifications`) is half the
  file, so "providers stays" means "the provider entry stays", while the `layout` option leaves it.

## Decisions

The maintainer settled the three questions the first draft left open (2026-11-06).

1. **Sentinel lists the directory and fetches the tree**, not a fixed list of area names. The cost is a client change
   (a typed directory listing) in phase 2, and the gain is that a new area or subfolder needs no Sentinel change and that
   an area file may import a sibling. Caps on file count, per-file size and total size bound what Sentinel reads.
2. **Area files are TypeScript in this repo and JSON in content-only repos**, as the draft recommended. The notifications
   layout keeps its explanatory comments (37 of its 227 lines).
3. **`RULES.md` and the webhook avatar move into `.holocron/`** (phase 5 is no longer optional). `RULES.md` is then no
   longer shown in the root file list, so the pinned file's new path is the one place to look. The avatar moves only
   after checking what else uses its current folder.

## Open questions

1. **Keys that never move**: `repo.defaultBranch` at least. Is there any other key Sentinel needs before it reads
   `.holocron/` (for example `org`, `name`)?
2. **A JSON Schema of `HolocronConfig`** (for `$schema` in `.holocron/*.json`)? Out of scope here; it would be the
   typing story for json-config repos and needs its own issue.
3. **Does `tsc` or ESLint see `.holocron/*.ts`?** The root `tsconfig.json` has `"files": []` and references only
   `./cli/cli`, so how `holocron.config.ts` is type-checked today was not traced; a dot-directory may also fall
   outside the ESLint globs. Not verified; phase 3 must show that `lint:code` and `typecheck` cover the new file.
4. **Name for the type helper** (`defineLayout`) and whether each area gets one, or only `defineConfig`.
