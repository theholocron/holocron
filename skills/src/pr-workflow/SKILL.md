---
name: pr-workflow
title: PR Workflow
description: Pull request workflow rules. INVOKE WHEN: opening a PR, merging, closing a PR, creating a branch. Always open a PR — never push directly to the default branch.
---

# PR workflow

## core rules

- **Always open a PR — never push directly to the default branch.** Even for
  small fixes: create a branch, push it, open a PR. This lets CI run, keeps
  history reviewable, and respects branch protection. The only exception is
  bootstrapping a brand-new repo before protection is set up.
- **One PR = one focused change.** Squash-merge; the PR title becomes the
  squashed commit subject that semantic-release reads.
- **File issues for non-trivial work** and reference them in commits/PRs
  (`Closes #N` / `Refs #N`). Skip for typo fixes.

## opening a PR

1. Create a branch from the correct base (usually `main`; `alpha` in holocron)
2. Push the branch: `git push -u origin <branch>`
3. Open the PR with `gh pr create` — title = squashed commit subject (Conventional Commit format)
4. Reference any related issues in the body

## merging

- Squash-merge only — the PR title becomes the single commit on the base branch
- The merge commit subject must follow Conventional Commits so semantic-release
  can compute the correct version bump

## closing / discarding

**Delete the branch when closing, never just close the PR.** A closed-but-existing
branch blocks future PR creation for the same branch name — GitHub returns 422
"A pull request already exists" and the sync silently skips opening a new one.

```sh
gh pr close <n> --repo <owner>/<repo> --delete-branch
```

## bad sync PRs

If a workflow-sync PR is stale or wrong, use the command above. Do NOT close the
PR without deleting the branch or the next sync run will silently fail.

## Checklist before requesting review

- [ ] Feature branch created before any code was written
- [ ] Package entry added to registry (if applicable)
- [ ] Docs page added or updated in the same PR (if adding a new capability)
- [ ] Tests written for new behavior
- [ ] PR title follows Conventional Commits
- [ ] CI green before requesting review
