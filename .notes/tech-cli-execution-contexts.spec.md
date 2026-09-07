---
status: draft
issue: theholocron/holocron#576
blocked-by: []
related:
  - theholocron/holocron#449
  - theholocron/holocron#451
  - theholocron/holocron#566
---

# CLI execution contexts — global vs workspace

`npm i -g @theholocron/cli` is half-usable. Plugin commands (`sync`,
`setup`, `doctor`, …) crash with a raw `Cannot find package
'@theholocron/holocron-plugin-*'` because plugins are resolved as
siblings of the CLI and a global install has none. But most of the
command surface needs no plugins and would run fine globally — the CLI
just does not distinguish the two.

## Three contexts

| Context          | Needs                                                          | Commands                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`global`**     | nothing but the CLI binary                                     | `version`, `clone`, `new`, `upgrade node`, `plugin create`, `auth set` / `unset` / `list`, `npm bump-versions`, `npm publish-initial`, `skills install` / `remove` / `update` |
| **`repo-aware`** | `./holocron.config` + `./package.json` in cwd, no plugins      | `run <task>` (#449), `ci` (#451), `config show`                                                                                                                               |
| **`workspace`**  | plugin packages resolvable (devDeps in a repo, or `pnpm exec`) | `sync`, `setup`, `doctor`, `secrets sync`, `deploy`, `cleanup-preview`, `sync-github`, `auth check`                                                                           |

`global` commands work anywhere. `repo-aware` commands read the local
config relative to cwd but never touch the plugin loader. `workspace`
commands need the plugin loader to succeed.

## Design

### 1. Tag every command with its context

A `context: "global" | "repo-aware" | "workspace"` field on the command
registry (the same registry #438's interactive menu wants). Single
source of truth; drives the checks below and the `--help` grouping.

### 2. Graceful error on a context mismatch

Before a `workspace` command runs its handler, probe whether the
configured providers' plugin packages resolve. On failure:

> `sync` needs `@theholocron/holocron-plugin-github` (and 3 others).
> Run it from a repo that has the plugins as devDeps, or `pnpm exec
holocron sync`. A global install cannot resolve them.

Not a stack trace. The `PluginLoader` already collects `loadFailures()`
(#549) — surface them as one actionable message when _every_ provider
failed to load and we are not in a workspace.

Detecting "not a workspace": no `node_modules/@theholocron/holocron-plugin-*`
resolvable from cwd **and** the CLI's own `node_modules` has none either.

### 3. `repo-aware` commands validate what they can actually run

`holocron run test` in a repo with no `test` script — and no
holocron-managed `test` task in `config.scripts` (#566) — must print
`no "test" script configured in package.json or holocron.config` and
exit non-zero. Never a silent exit 0. Same for `ci` when a stage has
nothing to run.

### 4. `auth check` degrades in a `global` context

`auth check <provider>` loads the plugin to run `verifyToken` / `whoami`.
`auth set` / `auth list` already work plugin-free. In a `global` context
`auth check` should report `token present — verification skipped (plugin
not available here)` rather than crash, mirroring `auth set`.

### 5. Documented surface

`holocron --help` groups commands by context. A docs page
(`docs/.../execution-contexts.mdx` or a section in an existing page)
lists what a bare `npm i -g` gets you.

## Non-goals

- **Shipping plugins with the global CLI.** The workspace/local-install
  model (plugins as devDeps, `overrides:` collapsing `http-client` to one
  version) stays. This spec is about failing gracefully and making the
  plugin-free commands first-class.
- A plugin auto-installer. If someone wants `sync` globally they install
  the plugins themselves.

## Open questions

- Does `config show` genuinely work `repo-aware` today (it resolves
  plugin _package names_ but does it import them)? Confirm before tagging.
- Should `repo-aware` commands fall back to a set of built-in task
  mappings (`test` → `pnpm test`, `build` → `pnpm build`) when
  `config.scripts` is absent, or require the config? (#449 territory.)
- Is there value in a `holocron doctor --local-only` that runs just the
  non-plugin checks?

## Rollout

1. Command-registry `context` field (shared with #438).
2. Workspace-probe + graceful `workspace`-context error.
3. `repo-aware` validation in `run` / `ci` as those land (#449 / #451).
4. `auth check` degradation.
5. `--help` grouping + docs page.
