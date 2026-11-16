---
status: archived
issue: theholocron/holocron#374
blocked-by: []
related:
  - theholocron/holocron#1704
---

# Keep the destructive command guard hook in `.claude/settings.json`

## Problem

The destructive command guard (`dcg`) is a Claude Code `PreToolUse` hook that checks each Bash command before it runs.
Wiring it in means a hand-edited `.claude/settings.json` in every repo, so a repo can drift, miss it or lose it in a merge.
The other files `holocron setup` writes are kept in step by `sync` and checked by `probe generated check`; this one is not.

## Decision

- **Opt-in.** `agent: ["claude", { dcg: true }]` in `holocron.config.ts` (`AgentOptions`), the form a provider takes: `agent` is a name, or a name with its options. `splitAgent()` keeps the
  name in `config.agent`, so what installs skills is unchanged, and puts the options in `config.agentOptions`; an unknown
  option, a `dcg` that is not a boolean and `dcg: true` on an agent other than `"claude"` are a `ConfigError`. A repo that
  sets nothing gets no file, no step and no change; there is no default, because a repo no one uses Claude in should not gain a Claude settings file.
- **Merged, never replaced.** `generateClaudeFiles()` reads `.claude/settings.json` and `withDcgHook()` adds one entry to
  `hooks.PreToolUse` (`{ matcher: "Bash", hooks: [{ type: "command", command: "dcg" }] }`), keeping `permissions`, other hook
  events and other matchers. A Bash entry that already runs `dcg` (with arguments, or by path) is left alone, so a second
  run changes nothing. A file that is not JSON, or whose `hooks` or `hooks.PreToolUse` is not an object or a list, makes the
  step report an error naming the file, and it is not overwritten.
- **Same bytes from `setup` and `sync`.** The generator is part of `generateRepoFiles()` and writes with
  `formatJson()` (now exported from `@theholocron/astromech`), which lays JSON out as Prettier does.
- **Checked.** `probe generated check` compares the generated text with the committed file, so a missing hook fails it.
  Opting in then means running `holocron setup`, or `holocron sync claude`, once and committing the file.
- **The binary is the operator's.** `dcg` is not in Homebrew and its installer is a script from the tool's own repository, so
  `.humans/setup.sh` does not pipe it into a shell. A step, run only when `.claude/settings.json` runs `dcg`, reports it
  installed, prints the install command for a person to read and run, and `doctor` fails when it is missing. The
  Brewfile is not used, since a repo or machine that does not opt in is not asked for it.

## Not decided here

- Other Claude settings (permissions, other hooks). `claude` is an object so they can follow.

## This repo

It opts in. `.claude/` was ignored whole, so `.gitignore` now ignores `.claude/*` and lets `.claude/settings.json` through: the
check compares the generated text with the file on disk, and a fresh clone in CI has no file that git ignored.

## Testing

`withDcgHook()` over empty, populated, already-wired and malformed settings; `generateClaudeFiles()` over a real directory
(no opt-in, no file, merged file, idempotent, JSON that does not parse, wrong shape) and as part of `generateRepoFiles()`.

## Acceptance criteria

- A repo with `agent: ["claude", { dcg: true }]` gets `.claude/settings.json` with the hook from `holocron setup`, and `holocron sync`
  leaves `git diff` empty afterwards.
- `holocron probe generated check` fails on that repo when the hook is removed, and passes once it is back.
- A repo with no agent options is unchanged.
