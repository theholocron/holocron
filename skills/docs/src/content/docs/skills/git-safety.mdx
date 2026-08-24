---
title: git-safety
description: Guard rails for destructive git operations. Never force push or reset without explicit permission.
---

Prevents accidental data loss from destructive git operations.

**Invoke as:** `/git-safety`

**Trigger:** git push, force push, git reset, git clean, any destructive git operation.

## Rules

These commands require **explicit user permission** before running:

| Command | Risk |
| --- | --- |
| `git push --force` / `-f` | Overwrites remote history |
| `git push --force-with-lease` | Overwrites remote history |
| `git reset --hard` | Discards all uncommitted changes |
| `git clean -fd` | Permanently deletes untracked files |
| `git checkout -- .` | Discards all working tree changes |

## Safe alternatives

**Instead of `git reset --hard`:** use `git stash` to save changes, then `git stash pop` to restore.

**Instead of force push:** use `git pull --rebase` then a normal push. If histories are intentionally diverged, ask the user how to proceed.

**Instead of `git clean -fd`:** use `git stash --include-untracked` or review with `git status` first.

## Standard workflow

1. `git pull` before making changes
2. `git checkout -b <type>/<description>` to create a branch
3. `git add <specific-files>` — never `git add -A` carelessly
4. `git commit -s` (DCO required)
5. `git pull --rebase` again before push
6. `git push -u origin <branch>` — no force flags
7. Open a PR — never push directly to the default branch
