---
title: pr-workflow
description: Pull request workflow rules. Always open a PR — never push directly to the default branch.
---

Enforces the PR-first workflow across all `@theholocron` repositories.

**Invoke as:** `/pr-workflow`

**Trigger:** opening a PR, merging, closing a PR, creating a branch.

## Core rules

- **Always open a PR** — never push directly to the default branch. Even for small fixes: create a branch, push, open a PR. This lets CI run and keeps history reviewable.
- **One PR = one focused change.** Squash-merge; the PR title becomes the squashed commit subject that semantic-release reads.
- **File issues for non-trivial work** and reference them in commits/PRs (`Closes #N` / `Refs #N`). Skip for typo fixes.

## Opening a PR

1. Create a branch from the correct base (usually `main`; `alpha` in holocron)
2. Push: `git push -u origin <branch>`
3. Open with `gh pr create` — title must follow Conventional Commits format

## Merging

Squash-merge only. The PR title becomes the single commit on the base branch and must follow Conventional Commits so semantic-release computes the correct version bump.

## Closing / discarding

**Delete the branch when closing — never just close the PR.** A closed-but-existing branch blocks future PR creation for the same branch name (GitHub returns 422).

```bash
gh pr close <n> --repo <owner>/<repo> --delete-branch
```
