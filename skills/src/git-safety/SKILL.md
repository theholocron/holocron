---
name: git-safety
title: Git Safety
description: Git safety rules. INVOKE WHEN: git push, force push, git reset, git clean, destructive git operations. NEVER force push or do destructive git operations without explicit permission.
---

# git safety

## rules

- NEVER force push (`git push --force` or `git push -f`)
- NEVER `git reset --hard` without explicit user permission
- NEVER `git clean -fd` without explicit user permission
- NEVER `git checkout -- .` (discards all changes) without explicit user permission
- Prefer `git stash` over `git reset` to save work before switching context
- Always `git pull` (or `git fetch` + rebase) before `git push`

## forbidden commands

These require EXPLICIT user permission before running:

- `git push --force`
- `git push -f`
- `git push --force-with-lease`
- `git reset --hard`
- `git clean -fd`
- `git checkout -- .`

If you find yourself about to run one of these, stop and ask the user first.

## safe alternatives

**Instead of `git reset --hard`:**

- `git stash` to save changes temporarily
- `git stash pop` to restore them later

**Instead of force push:**

- `git pull --rebase` then normal push to reconcile diverged history
- If history is intentionally diverged, stop and ask the user how they want to proceed

**Instead of `git clean -fd`:**

- `git stash --include-untracked` to preserve files
- Review untracked files with `git status` before deciding to delete

## standard workflow

1. `git pull` (or `git fetch && git rebase origin/main`) before making changes
2. Create a branch: `git checkout -b <type>/<description>`
3. Make changes, then `git add <specific-files>` (never `git add -A` carelessly)
4. `git commit -s` (DCO required in theholocron repos)
5. `git pull --rebase` again before push to catch any upstream changes
6. `git push -u origin <branch>` (no force flags)
7. Open a PR — never push directly to the default branch
