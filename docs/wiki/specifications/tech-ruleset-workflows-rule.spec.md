---
id: SPEC-0043
status: archived
issue: theholocron/holocron#678
blocked-by: []
related:
  - theholocron/holocron#672
  - theholocron/holocron#666
  - theholocron/holocron#667
  - theholocron/holocron#668
  - theholocron/holocron#669
discussion:
  url: https://discord.com/channels/1303969001822486568/1566620402837364796
---

# Ruleset investigation — GitHub `workflows` rule type

Workstream spec under the [Holocron Platform epic](https://github.com/theholocron/holocron/issues/672)
(`docs/wiki/specifications/tech-holocron-platform.spec.md`). Covers the "Ruleset investigation
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

## Findings

Resolved from GitHub's own documentation (no prototype needed — the
platform's documented constraints rule out adoption on their own, before
ever reaching `monorepo-nextjs-template`):

1. **The rule's required workflow must declare `pull_request`,
   `pull_request_target`, or `merge_group` in its own `on:` — `workflow_call`
   is not a supported trigger.** ([GitHub docs][docs]) Every reusable
   workflow in `theholocron/.github` is `workflow_call`-only by design — that
   is what makes it reusable. **This negates payoff 3 outright**: the rule can
   never target a reusable workflow directly. It can only target a
   `pull_request`-triggered workflow physically present in the consumer
   repo — which in this org's architecture is exactly the thin-caller file
   `holocron sync github` already generates and keeps there. No file goes
   away; only what gates on it changes.
2. **A ruleset workflow "can't use most CodeQL actions" — only
   `github/codeql-action/upload-sarif` is allowed.** ([GitHub docs][docs])
   `security.codeScanning`'s reusable workflow calls `codeql-action/init`,
   `/autobuild`, and `/analyze` — all three disallowed. One of this org's
   own currently-required checks (`Security / Code Scanning / Analyze
(javascript-typescript)`) could not be migrated to this rule type at
   all, independent of finding 1.
3. **The rule type only gates on GitHub Actions workflow runs — it cannot
   reference a GitHub App's custom Check Run.** Every one of Sentinel's 12
   posted checks (`Platform / Compliance / …`, `Source Quality / Static
Analysis / Run eslint`, etc.) and every Codecov flag
   (`codecov/patch/<pkg>`, 20 and growing with the package count) would
   have to stay on `required_status_checks`/exact-string matching
   regardless of what this workstream decides for the Actions-native
   checks. There is no path to _fully_ replacing
   `astromech.requiredChecks()` — only ever a partial one.

Finding 3 is the decisive one. The rename-orphaning risk this workstream
set out to fix is **not evenly distributed** across the required-checks
list: Sentinel's checks are the actively-growing, actively-renamed part of
it (this very session renamed several of them in #989/#990, independent of
this investigation), while the Actions-native thin-caller job/workflow
names are comparatively stable and rarely touched. Migrating only the
smaller, already-more-stable slice — at the cost of a real rewrite of
`astromech`'s required-checks generation into a second, parallel mechanism
(ruleset `workflows` rules, keyed by `repository_id` + `path`, alongside
the existing string-list one for everything Sentinel/Codecov posts) — is a
worse trade than it first looked. The core motivating bug (#45) is real,
but this lever doesn't close it for the part of the surface where it bites
hardest and most often.

## Decision: No-Go

Don't adopt the `workflows` ruleset rule type. Keep
`astromech.requiredChecks()` and exact-string required-status-check
matching as the standing mechanism for all required checks — Actions-native,
Sentinel-posted, and Codecov alike.

**Why:** the rule type cannot touch Sentinel's checks or Codecov's flags at
all (structural — they're not Actions workflow runs), and cannot touch this
org's own CodeQL scanning check either (the action restriction). What's
left in scope for migration is the Actions-native thin-caller checks —
already the smaller, more stable fraction of the required-checks surface,
and the fraction least likely to drift. Splitting required-checks
generation into two parallel mechanisms to fix the easier, lower-frequency
half of the problem isn't worth the mechanism's own ongoing maintenance
cost.

**When to revisit:** if GitHub ever extends this rule type to support
`workflow_call` triggers directly, or to reference an arbitrary Check Run
(not only an Actions workflow run) — either change would remove one of the
two structural blockers above and meaningfully change this trade-off.
Nothing else about this decision is time-bound.

[docs]: https://docs.github.com/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets

## PR-stack

None — no-go, nothing to implement.
