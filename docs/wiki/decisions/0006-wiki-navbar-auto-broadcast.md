---
id: ADR-0006
title: "Auto-broadcast wiki navbar sync on push"
status: proposed
date: 2026-09-05
owners: []
specs: []
discussion:
  github:
supersedes: []
superseded-by: []
tags: [wiki, fern, sync, automation, ci]
---

# Auto-broadcast wiki navbar sync on push

- Status: proposed
- Date: 2026-09-05

## Context and Problem Statement

Each wiki-enabled repo has a `fern/docs.yml` with a `navbar-links` dropdown
("Other Projects") listing every other wiki in the org. `holocron sync wiki`
rebuilds that list by querying the GitHub API. When a new repo adds wiki
capability and merges its config, its own `sync.yml` runs and updates its own
navbar automatically. However, every existing repo's navbar still shows the old
list — the new repo is invisible to them until someone manually dispatches
`sync-broadcast.yml` with `steps=wiki`.

## Decision Drivers

- Adding a new wiki repo should not require any manual follow-up to propagate
  its link to the rest of the org.
- The solution must not create a dispatch loop (broadcast → sync → broadcast →
  sync → …).
- The token surface area should stay minimal — no new secrets.

## Considered Options

- **Option A** — Event-driven: dispatch the broadcast from inside `sync.yml`
  whenever `fern/docs.yml` is committed on a `push` event.
- **Option B** — Scheduled: add a cron trigger to `sync-broadcast.yml` that
  runs `steps=wiki` daily or weekly.
- **Option C** — Do nothing: rely on manual `sync-broadcast.yml` dispatch.

## Decision Outcome

Chosen option: **Option A (event-driven)**, because propagation is instant and
requires no scheduled jobs or manual steps. The loop is broken naturally: the
broadcast dispatches via `workflow_dispatch`, and the guard
`github.event_name == 'push'` prevents repos triggered by `workflow_dispatch`
from re-broadcasting.

### Positive Consequences

- New wikis appear in every repo's navbar within minutes of their first sync,
  with no manual action.
- No extra cron jobs or scheduled runs to maintain.

### Negative Consequences

- Requires `HOLOCRON_SYNC_TOKEN` to have `workflow` write permission on
  `theholocron/.github` (it already does for other broadcast uses).
- If a repo's `fern/docs.yml` is updated for reasons unrelated to wiki
  discovery (e.g. a Fern version bump), it still triggers the broadcast —
  harmless but slightly noisy.

## Pros and Cons of the Options

### Option A — Event-driven dispatch

- Good, because propagation is instant — no drift window.
- Good, because no new infrastructure (cron, separate workflow).
- Good, because the loop guard is simple and verifiable.
- Bad, because any `fern/docs.yml` change on `push` triggers the broadcast,
  not only changes caused by new wiki discovery.

### Option B — Scheduled broadcast

- Good, because it is simple — one new `schedule:` trigger in
  `sync-broadcast.yml`.
- Good, because it catches drift from any source (new repo, renamed repo, etc.).
- Bad, because propagation lags by up to the schedule interval (hours/days).
- Bad, because it runs even when nothing changed.

### Option C — Do nothing (manual)

- Good, because zero code change.
- Bad, because every new wiki requires a manual operator action to propagate.

## Implementation

Add one step at the end of the reusable `sync.yml` template
(`packages/cli/src/templates/index.ts`, `REUSABLE_WORKFLOWS` entry for
`sync`). The step fires only when:

1. `auto-commit` detected changes (`steps.auto-commit.outputs.changes-detected == 'true'`), and
2. the triggering event was a `push` (not a `workflow_dispatch` from a prior broadcast).

```yaml
- name: Broadcast wiki sync if navbar changed
  if: |
    steps.auto-commit.outputs.changes-detected == 'true' &&
    github.event_name == 'push'
  run: |
    if git diff HEAD~1 --name-only | grep -q 'fern/docs.yml'; then
      gh workflow run sync-broadcast.yml \
        --repo theholocron/.github \
        --field steps=wiki \
      || echo "skipping broadcast — insufficient permissions"
    fi
  env:
    GH_TOKEN: ${{ secrets.HOLOCRON_SYNC_TOKEN }}
```

After merging the template change, run `holocron sync-github` to push the
updated `sync.yml` to all secondary repos (or let the existing
`sync-github.yml` CI do it on the next merge to `main`).
