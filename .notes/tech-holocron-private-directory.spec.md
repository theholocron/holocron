---
id: SPEC-0079
status: draft
issue: theholocron/holocron#2078
blocked-by: []
related:
  - theholocron/holocron#2058
  - theholocron/holocron#2076
discussion:
  url: https://discord.com/channels/1303969001822486568/1569958054844309554
---

# A git-ignored `.holocron/.private` directory for secret-bearing files

## Problem

`holocron auth export` and `holocron github-app create` write a `.credentials` file next to the config and rely on a root `.gitignore` entry plus a run-time ignore check. A file that holds secrets should have one place that can never be committed, so a command can write there without a per-file rule.

## Design

- **The directory.** `.holocron/.private/` holds a tracked, empty `.gitkeep`; a `.gitignore` managed block ignores the rest (`.holocron/.private/*`, `!.holocron/.private/.gitkeep`). Markers: `# managed by holocron setup — private directory` and its `# end ...` line, merged by `upsertManagedBlock()` into the file on disk so the rest (and the skills blocks) stay.
- **Generation.** `generatePrivateDirFiles()` in `repo-files/`, called from `generateRepoFiles()`, so `repo setup`, `repo sync` and `probe generated check` have one source. `repo sync` gets a local step `private` (like `agents`: root of the checkout only). Neither file is formatted by Prettier (no parser), so the bytes are stable.
- **Callers.** `resolveCredentialsFile(base, file)` returns `--file` when given (relative to `base`), else `.holocron/.private/.credentials`, and makes the directory (mode 0700) for the default before git is asked, because `git check-ignore` is run in the file's directory and a missing one reads as "not in a repository". `auth export` and `github-app create` use it. Every refusal stays: never overwrite, mode 0600, the ignore check, deletion after the import. When the default path is not ignored, the message says to run `holocron repo sync` (`ignoreAdvice()`).
- **Where the constant lives.** In the CLI (`cli/cli/src/private-dir/`), not `@theholocron/kyber/secrets`: kyber is meant for any CLI and carries no Holocron names, and `.holocron` is one. The kyber helpers (`writeCredentialsFile`, `finishCredentialsFile`) still take a path. The 1Password export probe (#2076) will call the same helper once this lands.
- **This repo.** The `.gitkeep` and block were produced by running `holocron repo sync private`; the old root `.credentials*` entry stays.

## Open questions

1. The directory is made on first use of the default path, even if the ignore check then refuses, so a repo that never ran `repo sync` gets an empty untracked directory. Acceptable?
2. `--force` replaces through a temporary `.credentials.<random>.tmp` beside the file; it is now inside the private directory, so the `.credentials*` root rule is no longer what covers it.
3. Existing `.credentials` files at the repo root are not moved or read; a person who has one deletes it.
4. The `.gitkeep` goes through the provider's `writeRepoFile` in `repo setup` with empty content; confirm the GitHub contents API accepts an empty file there.
