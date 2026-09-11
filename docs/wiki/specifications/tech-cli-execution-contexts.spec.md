---
status: accepted
issue: theholocron/holocron#576
blocked-by: []
related:
  - theholocron/holocron#449
  - theholocron/holocron#451
  - theholocron/holocron#438
  - theholocron/holocron#566
---

# CLI execution contexts — global vs workspace

`npm i -g @theholocron/cli` used to be half-usable. Plugin commands
(`sync`, `setup`, `doctor`, …) crashed — or half-ran and reported a
wall of skips — with a raw `Cannot find package
'@theholocron/holocron-plugin-*'` because plugins are resolved as
siblings of the CLI and a global install has none. But most of the
command surface needs no plugins and runs fine globally; the CLI just
did not distinguish the two.

## Three contexts (as built)

| Context          | Needs                                                          | Commands                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`global`**     | nothing but the CLI binary                                     | `version`, `clone`, `new`, `upgrade node`, `upgrade deps`, `plugin create`, `auth set` / `unset` / `list` / `check`, `npm bump-versions`, `npm publish-initial`, `skills install` / `remove` / `update` |
| **`repo-aware`** | `./holocron.config` + `./package.json` in cwd, no plugins      | `run`, `ci`, `config show`, `sync-readme`                                                                                                                                                               |
| **`workspace`**  | plugin packages resolvable (devDeps in a repo, or `pnpm exec`) | `doctor`, `setup`, `sync`, `secret set`, `secrets sync`, `deploy`, `cleanup-preview`, `sync-github`                                                                                                     |

`auth check` is tagged `global` — it _tries_ to load the plugin to
verify, but degrades gracefully when it can't (see §4), so it's usable
anywhere. `sync-github` needs the holocron monorepo checkout (the
generated templates), not plugins — it's `workspace` because it's only
ever run with `pnpm exec` from this repo.

## Design — as implemented

### 1. `COMMAND_CONTEXTS` — `packages/cli/src/commands/contexts.ts`

A `Record<commandName, "global" | "repo-aware" | "workspace">` — the
single source of truth. `contextForCommand(name)` resolves an exact
key (`"upgrade node"`), falls back to the leading verb, then
`undefined`. `commandsInContext(ctx)` drives the `holocron --help`
epilogue. Shared with the interactive-menu registry (#438) when that
lands. `contexts.test.ts` asserts the map matches the documented
surface exactly — a new command without a context entry fails the
test.

### 2. Graceful `workspace` error — `packages/cli/src/plugin/workspace.ts`

`assertPluginsResolvable(loader, command)` is called right after
`await loader.load()` in every plugin-dependent command (`doctor`,
`setup`, `sync`, `secret set`, `secrets sync`, `deploy`,
`cleanup-preview`). It throws `WorkspaceContextError` **only** on the
global-install signature: the registry is empty, there is at least one
load failure, and _every_ failure is a missing-package error
(`LoaderError` whose message starts `failed to import`). Any other mix
— some capability loaded, or a failure that's an auth/token error — is
left to the command's own soft-skip reporting.

`WorkspaceContextError` carries `command` + the unresolved
`packages[]`; its message names the first package (plus an "(and N
others)" count) and points at `pnpm exec holocron <cmd>` and the docs
page. `cli.ts`'s top-level catch prints `.message` for a small
`USER_FACING_ERRORS` set (`WorkspaceContextError`, `ConfigFileError`)
instead of leaking a stack trace.

`sync` keeps the guard even though some of its steps are local-only —
running it globally and silently skipping every GitHub-side step is
exactly the confusing outcome this issue is about. `sync-readme` is
`repo-aware` (never loads a plugin) and is not guarded.

### 3. `repo-aware` validation — already covered by #449

`holocron run test` in a repo with no `test` script and no
holocron-managed `test` task prints `· no test task for this repo`
(a visible line, not a silent exit 0). `unknown task` → exit 1.
`--required` turns the skip into a failure, which is what `holocron ci`
passes for its required set. No new code was needed here.

### 4. `auth check` degradation — `runAuthCheck`

When the plugin import fails with a module-not-found error
(`isModuleNotFound()` — `ERR_MODULE_NOT_FOUND` / `MODULE_NOT_FOUND` /
"Cannot find package"), `auth check` now prints `token present —
verification skipped (plugin not available here)` and returns
`{ status: "ok", message: "stored, unverified (plugin not available)" }`,
mirroring how `auth set` already stores without verification. A real
verification failure (bad token, network error) still returns
`{ status: "fail" }`.

### 5. Documented surface

`holocron --help` epilogue lists the three contexts and their commands.
`docs/src/content/docs/execution-contexts.mdx` is the reference page;
`packages/cli/README.md` has a short section.

## Non-goals (unchanged)

- **Shipping plugins with the global CLI.** The workspace/local-install
  model (plugins as devDeps, `overrides:` collapsing `http-client` to
  one version) stays.
- A plugin auto-installer.
- `holocron doctor --local-only` — no demand for a non-plugin doctor
  subset; dropped.

## Rollout — done

1. `COMMAND_CONTEXTS` + helpers (`contexts.ts`).
2. `assertPluginsResolvable` + `WorkspaceContextError` (`workspace.ts`),
   wired into the 7 plugin-dependent commands + `cli.ts` catch.
3. `auth check` degradation.
4. `--help` epilogue + docs page + README section.
