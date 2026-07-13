<!-- editorconfig-checker-disable-file -->
---
status: proposed
issue: 115
---

# Smoke-test synced actions in sync-github workflow

## Problem

`sync-github` pushes composite actions and reusable workflows to
`theholocron/.github` with no validation step. Correctness is only
discovered when a downstream repo actually runs the workflows.

Two bugs shipped this way (discovered when `theholocron/configs` first
exercised the full stack end-to-end):

- `setup-node` passed `version: 10` alongside `packageManager` in
  `package.json`, causing `ERR_PNPM_BAD_PM_VERSION` in `pnpm/action-setup` v4
- `reviewdog/action-eslint` was missing `package_manager: pnpm`, causing
  it to fall back to `npm install`, which fails in pnpm repos

The root cause is that templates were only implicitly tested against
`theholocron/holocron` itself, and the failing steps were never triggered
in that repo's CI during development.

## Proposed solution

Add a smoke-test job to the `sync-github` reusable workflow that runs
**after** the sync push, before opening the PR:

1. **actionlint** — lint the pushed workflow YAML files for structural
   errors and expression type issues. Fast, catches most classes of
   mistake before runtime.
2. *(stretch)* Trigger a `workflow_dispatch` dry-run in a known consumer
   repo (e.g. `theholocron/.github` itself) to catch runtime failures
   before they land in `main`.

## Process gap (independent of the tooling fix)

When adding a new template input or action step, manually verify it
against at least one consuming repo that differs from `holocron`:

- Does the repo use `packageManager` in `package.json`? (pnpm conflict)
- Does the repo lack a tool that the action installs via npm fallback?
- Does the new input have a sensible default for repos that don't set it?

## Acceptance criteria

- [ ] `sync-github` fails fast if pushed YAML is malformed (actionlint)
- [ ] PR description or commit body documents what was manually tested
      when a new template input or action step is added
