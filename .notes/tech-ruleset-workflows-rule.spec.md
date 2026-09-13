---
status: draft
issue: theholocron/holocron#678
blocked-by: []
related:
  - theholocron/holocron#672
  - theholocron/holocron#666
  - theholocron/holocron#667
  - theholocron/holocron#668
  - theholocron/holocron#669
---

# Ruleset investigation — GitHub `workflows` rule type

Workstream spec under the [Holocron Platform epic](https://github.com/theholocron/holocron/issues/672)
(`.notes/tech-holocron-platform.spec.md`). Covers the "Ruleset investigation
(Phase A)" section of that spec in full detail.

## Problem

`monorepo-nextjs-template`#45 was stuck on a branch ruleset with 5 phantom
required-check contexts (renamed/consolidated workflow outputs the ruleset
was never updated to match). `astromech.requiredChecks()` drives
branch-protection required-status-checks by matching a **check-run name
string** — the root cause: a rename anywhere in the chain (job name, matrix
leg label, workflow output) silently orphans the string the ruleset is
still looking for, and nothing fails loudly when that happens.

## The mechanism to investigate

GitHub organization/repo rulesets support a `workflows` rule type ("require
workflows to pass before merging") that references a **workflow file**
directly (by repository + path + ref) — the ruleset itself is what invokes
and gates on that workflow, not a locally-triggered `uses:` caller. One
lever, three separate payoffs, all stemming from the same root fix —
required checks stop being **name strings the ruleset matches** and become
**workflows the ruleset runs**:

1. **The stale-check-name bug class disappears.** A renamed/consolidated job
   can never orphan a stale required-check string, because the ruleset isn't
   tracking a string at all.
2. **The synthetic `Conclusion` aggregator job becomes unnecessary.** GitHub
   already computes a workflow run's overall conclusion by aggregating every
   job in it, matrix legs included — that's exactly what the hand-rolled
   `Conclusion` job exists to fake today under check-run-name matching. Gate
   on the workflow's own run conclusion and the aggregator layer has nothing
   left to do.
3. **Possibly no thin-caller file in the consumer repo at all**, depending on
   whether the rule can reference a workflow living in `theholocron/.github`
   directly versus one physically present in the consumer repo.

## What this workstream needs to confirm before committing

- Whether the rule targets the **caller** repo's workflow (thin caller) or
  can point at the **reusable** workflow in `.github` directly.
- How it interacts with a matrix job (Storybook per-project fan-out) whose
  individual outputs are what we actually want gated.
- Whether `astromech.requiredChecks()` needs to keep existing at all, shrink
  to the handful of checks this rule type can't cover (codecov flags,
  external Chromatic checks), or go away entirely.
- Retain D8's check-name parity regardless of outcome: `holocron ci` already
  prints each task using the identical `WORKFLOW_CHECK_CONTEXTS` string
  GitHub's check list shows (`▶ Lint / Conclusion`, not `▶ lint`) — a
  developer sees the same names locally as on a PR. Don't lose this.

## Scope

- Prototype against one low-stakes repo first — `monorepo-nextjs-template`
  is the natural candidate since it already surfaced the bug (#45).
- Produce findings + a go/no-go recommendation before any org-wide migration.
- No changes to the reusable workflows themselves beyond what's needed to
  prototype.

## Out of scope

- Org-wide rollout of whatever mechanism wins — that's a follow-on once this
  workstream has a decision, tracked separately (or folded into the
  migration pass, #680, if the scope stays small).

## Open questions

- Whether `astromech.requiredChecks()` is fully replaced by the `workflows`
  rule, partially replaced, or kept as a fallback for checks the rule type
  structurally can't cover.

## PR-stack

TBD — filed once the prototype against `monorepo-nextjs-template` has
findings and a go/no-go decision.
