---
id: SPEC-0078
status: draft
issue: theholocron/holocron#2076
blocked-by: []
related:
  - theholocron/holocron#2058
discussion:
  url: https://discord.com/channels/1303969001822486568/1569951673059774594
---

# 1Password: export one Environment to a `.credentials` file

## Problem

Moving a 1Password Environment into another (the renames and merges in #2058) means copying its values by hand, through the clipboard or a file the maintainer must remember to delete. `holocron auth export` does the other direction (the keyring's tokens to a private `.credentials`); nothing does it for an existing Environment.

## Design

A writer probe in the 1Password plugin, `holocron probe 1password export-environment <environment> [--only NAME]... [--copy]`.

- **Read.** `OpCredentials.read()` (`op environment secret list <env> --reveal --format=dotenv`, parsed by `parseDotenv()`), so there is one reader. The argument is a name or id as `op` takes it, or a layer word resolved by `resolveEnvironmentId()` (the `secrets sync` resolver, #2072). The plugin gets `repoRoot` from the CLI's runtime context, which `createPlugin` already receives.
- **Write.** `NAME=value` through `dotenvLine()`, sorted. Destinations follow `holocron auth export`: a terminal gets a new `.holocron/.private/.credentials` (the private directory of #2078, made first with `resolveCredentialsFile()`, and a repo without its ignore rule is told to run `holocron repo sync`; `writeCredentialsFile`, mode 0600, never forced, refused unless Git ignores the path, refused on Windows), a pipe gets stdout, `--copy` the clipboard, a redirected file is refused (`stdoutKind()`).
- **Finish.** `finishCredentialsFile()` prints where the file is, the 1Password import steps (this plugin's text) and deletes it on Enter. The same deletion is registered with `ctx.cleanup` as soon as the file exists, so a failure and Ctrl-C remove it too.
- **Flags.** `--only` and `--copy` reach a probe as arguments: `holocron probe` gains the two options and forwards them (as it already does `--warn` and `--files`). `--dry-run` reads the Environment, lists the names and a count, and writes nothing.
- **Rows go to stderr.** A new optional `Probe.reportsTo: "stderr"` makes the runner print rows on stderr, so a pipe carries only the `NAME=value` lines.
- **Values.** Never in a row, log or error. Each value is also handed to `ctx.secret()` so the runner's scrubber covers it, without relying on that alone.
- **CLI exports.** `stdoutKind()` and `resolveEnvironmentId()` are exported from `@theholocron/cli` (the plugin imports them there, not a copy).

## Open questions

1. A terminal gets the file, as in `auth export`. The issue words it as "a terminal is refused"; the reading here is that the redirected file is refused and a terminal gets the private file (otherwise nothing but `--copy` works interactively). Confirm.
2. The file needs a terminal to wait for the import, so without one (`--yes` in CI with stdout on a terminal and stdin not) the probe refuses instead of leaving the file, because the cleanup would delete it at once. Is a `--keep` option wanted?
3. Resolved: the file goes in `.holocron/.private/` under `repoRoot` (the `--cwd`), through the same `resolveCredentialsFile()` as `auth export` (#2078). The two differ only for a sub-package config.
4. `--only` and `--copy` are declared on `holocron probe` for every probe, though only this one reads them. A per-probe option declaration would be cleaner but needs a larger contract change.
5. Values that dotenv cannot carry unchanged (a quote of every kind, or a multi-line value with a double quote or backslash) are reported by name as failures and left out, as `auth export` does.
