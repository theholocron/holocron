---
status: archived
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

None — this workstream is closed with a no-go finding. No code changes.
`astromech.requiredChecks()` and the existing branch-protection ruleset
mechanism stay as-is.

## Findings (2026-09-15)

### What the rule type actually is

Confirmed via the REST API reference (`docs.github.com/en/rest/repos/rules`):
`"workflows"` is a real, documented rule type. Its parameters:

```jsonc
{
  "type": "workflows",
  "parameters": {
    "do_not_enforce_on_create": false, // optional
    "workflows": [
      {
        "path": ".github/workflows/test.yml", // required
        "repository_id": 873365952, // required — the repo the workflow file lives in
        "ref": "main", // optional
        "sha": "...", // optional
      },
    ],
  },
}
```

`repository_id` being a distinct, required integer is notable — it strongly
suggests the rule is designed to reference a workflow living in a
**different** repository than the one the ruleset is attached to (exactly
the "gate on `theholocron/.github`'s reusable workflow directly, no thin
caller needed" scenario question 3 asked about). This was never confirmed
working — see below.

One thing worth flagging for whoever revisits this: the **user-facing**
rulesets documentation page
(`repositories/configuring-branches-and-merges-in-your-repository/
managing-rulesets/available-rules-for-rulesets`) does **not** mention a
`workflows` rule at all as of this investigation — only the REST API
reference does. That mismatch (documented in the API schema, absent from
the human-facing rule catalog) is itself a signal, not just an oversight on
GitHub's part to note in passing.

### Prototyping — reproducible failure, cause not isolated

Tested via direct REST API calls (`enforcement: "evaluate"`, never
`"active"` — no risk to either repo's real gating) against both
`monorepo-nextjs-template` (the repo #45 actually happened on) and
`node-template` (as a second data point). Every attempt to create a ruleset
containing a `workflows` rule failed identically:

```json
{
  "message": "Validation Failed",
  "errors": ["Invalid rule 'workflows': Invalid parameter workflows: Workflow error at index 0: "],
  "status": 422
}
```

The error's own explanation clause is an **empty string** — GitHub's API
never says what's actually wrong. Variants tried, all producing the exact
same opaque error:

- `repository_id` pointing at the ruleset's own repo (same-repo reference).
- A workflow with `on: push + pull_request` triggers (`test.yml`) — this
  matches the one documented requirement found via GitHub Community
  discussions ("the workflow must have `pull_request`, `pull_request_target`,
  or `merge_group` in its `on:` for a ruleset to be able to run it") — and
  it _still_ failed.
- A workflow with only `on: schedule` (`stale.yml`), which should
  legitimately fail if the trigger-type requirement is real — but produced
  the identical message, giving no signal either way.
- `ref` omitted, `ref: "main"`, and `ref: "refs/heads/main"`.
- With and without `do_not_enforce_on_create`.

**Ruled out:** a blanket plan-tier gate on "advanced" rule types. The same
org, same free plan, accepted a `code_scanning` rule (another
non-`required_status_checks` rule type) on the first try with zero errors —
proving the API differentiates between rule types rather than rejecting
everything non-basic.

### Go/no-go

**No-go, for now.** Not because the mechanism is confirmed unworkable — it's
that the investigation hit a wall with no actionable error message, and
diagnosing an opaque `422` with an empty explanation string isn't a good use
of further time without a clearer signal from GitHub's side. Concretely
unresolved:

- Whether `workflows` needs an org-level feature flag/enrollment this org
  doesn't have (nothing found in `orgs/{org}/actions/permissions` or the
  ruleset UI, but that doesn't rule out something narrower — e.g. a
  workflow-level `permissions:` grant, or the "Enable required workflows"
  toggle GitHub's UI is rumored to gate behind rather than exposing purely
  via API).
- Whether cross-repo `repository_id` (pointing at `theholocron/.github`
  instead of the consumer repo) works at all, given same-repo references
  never got past validation either.
- Whether the trigger-type requirement from GitHub Community is accurate,
  real, or itself outdated.

### If this gets picked back up

- File a GitHub Support ticket first — get an actual error message before
  spending more engineering time on trial-and-error against an
  underspecified 422.
- Once (if) same-repo referencing works, that's the moment to test the
  cross-repo hypothesis (thin caller elimination) — don't assume it
  transfers.
- Re-test against whatever GitHub Community/changelog says has changed;
  this is a newer, apparently still-evolving rule type.

Everything in "What this workstream needs to confirm before committing"
above (matrix-job interaction, `requiredChecks()`'s fate, D8 check-name
parity) is now moot until the mechanism itself can be gotten to accept a
valid payload at all.
