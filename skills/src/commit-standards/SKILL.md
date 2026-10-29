---
name: commit-standards
title: Commit Standards
description: Commit message standards. INVOKE WHEN: writing a commit message, reviewing a commit, opening a PR. Always use Conventional Commits and sign commits with -s (DCO).
---

# commit standards

## Conventional Commits

All commit subjects must follow the Conventional Commits format:

```
<type>[optional scope]: <description>
```

### Types

| Type       | Use for                                             |
| ---------- | --------------------------------------------------- |
| `feat`     | New feature (triggers minor version bump)           |
| `fix`      | Bug fix (triggers patch bump)                       |
| `chore`    | Maintenance that doesn't affect published artifacts |
| `docs`     | Documentation-only changes                          |
| `ci`       | CI/workflow changes (won't appear in changelog)     |
| `test`     | Test additions or changes                           |
| `refactor` | Code restructuring with no behavior change          |
| `perf`     | Performance improvement                             |

### Breaking changes

Append `!` after the type/scope, or add `BREAKING CHANGE:` in the footer:

```
feat!: remove deprecated auth endpoint

BREAKING CHANGE: the /v1/auth endpoint has been removed; use /v2/auth
```

## Devmoji — always add the emoji

All commits use [devmoji](https://github.com/folke/devmoji). The emoji goes **inside the subject, after `type(scope): `** and before the description. The `prepare-commit-msg` hook adds it automatically on `git commit`, but always include it explicitly in `-m` strings:

```
feat: 💥 add OAuth2 login flow
fix: 🐛 handle null session on logout
fail: 💩 emergency patch for broken prod deploy
docs: 📚 update deploy prerequisites
chore: 🔧 update dependencies
ci: 👷 cache pnpm store
test: 🚨 add coverage for edge case
refactor: ♻️ extract helper function
perf: ⚡ reduce bundle size
build: 📦 migrate to tsdown
chore(release): 🚀 1.2.0
lint: fix all eslint warnings
```

| Type             | Emoji    | Notes                                          |
| ---------------- | -------- | ---------------------------------------------- |
| `feat`           | 💥       | New feature (custom: boom instead of sparkles) |
| `fix`            | 🐛       | Bug fix                                        |
| `fail`           | 💩       | Catastrophic failure or emergency hot fix      |
| `docs`           | 📚       | Documentation                                  |
| `chore`          | 🔧       | Maintenance                                    |
| `chore(release)` | 🚀       | Release                                        |
| `chore(deps)`    | 🔗       | Dependencies                                   |
| `ci`             | 👷       | CI changes                                     |
| `refactor`       | ♻️       | Refactor                                       |
| `test`           | 🚨       | Tests                                          |
| `perf`           | ⚡       | Performance                                    |
| `build`          | 📦       | Build changes                                  |
| `style`          | 🎨       | Style/formatting                               |
| `security`       | 🔒       | Security                                       |
| `revert`         | ⏪       | Revert                                         |
| `lint`           | _(none)_ | Extra accepted type; no emoji mapped           |

## DCO — always `git commit -s`

The `Signed-off-by:` trailer is required on every commit in theholocron repos.
The `-s` flag generates it automatically from your git config:

```sh
git commit -s -m "feat: add new thing"
```

Result:

```
feat: add new thing

Signed-off-by: Your Name <you@example.com>
```

Never skip `-s`. Branch protection and CI enforce DCO.

## Validate before committing, don't just guess

Per [commitlint's own AI-agent guidance](https://commitlint.js.org/guides/ai-agents.html):
treat the resolved commitlint config as a contract, not a memory exercise — verify a
draft message actually passes before running `git commit`, the same way you'd run a
type checker before trusting your own types are right.

```sh
# Resolved rules for this repo, if unsure what applies
npx commitlint --print-config json

# Validate a draft message before committing
printf '%s' "feat: 💥 add OAuth2 login flow" | npx commitlint
# exit 0 = passes
```

If a repo has `@theholocron/commitlint-config` installed, point at its built output
directly rather than relying on auto-discovery (same pattern this org's own
`commit-msg` hook and CI already use):

```sh
printf '%s' "<message>" | npx commitlint --config node_modules/@theholocron/commitlint-config/dist/index.js
```

If the `commit-msg` hook rejects a commit, the rejected rule name is in the error —
fix the message and retry. **Don't reach for `git commit --no-verify` to get past an
actual commit-message failure** — fix the message. (This is scoped to the message
itself: bypassing a hook for a separately-confirmed, pre-existing, unrelated failure
elsewhere in the repo is a different, occasionally legitimate call — see `git-safety`.)

## No agent attribution

Do not add `Co-Authored-By: Claude` or any agent attribution in commits, PRs,
issues, or docs. The author is always the user.

## Commit scope

Keep commits focused. One logical change per commit makes history bisectable and
makes semantic-release versioning accurate.
