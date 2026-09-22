---
status: draft
issue: theholocron/holocron#769
blocked-by: []
related:
  - theholocron/holocron#672
  - theholocron/holocron#674
  - theholocron/holocron#679
  - theholocron/holocron#680
---

# Sentinel as central enforcer — commit-message linting first

Workstream spec under the [Holocron Platform epic](https://github.com/theholocron/holocron/issues/672).
Sentinel (#679) today only _reports_: it reads `holocron.config.ts` from a
repo's default branch and posts one capability-compliance check. This spec
moves it toward _enforcing_ checks that are genuinely identical across every
repo — starting with commit-message linting, chosen deliberately as the
lowest-risk, highest-value first slice (see "Why commit-message linting
first," below).

## Problem

The platform epic's actual goal was never just "one shared config file
instead of twenty" — it was eliminating _duplicated enforcement_, full stop.
Bucket A (#676, #680) centralized the config each repo's own CI still runs
locally, but every repo still carries: its own `@theholocron/commitlint-config`
devDependency, its own `.husky/commit-msg` hook, and its own
`platform.commitStandards.yml` CI job — a real GitHub Actions runner,
checkout, and `pnpm install`, on every PR, in every repo, to re-verify rules
that are 100% identical everywhere (`commitlint-config`'s `index.ts` already
carries real, universal logic — every repo extends it via a pure pointer,
confirmed in `tech-config-resolution.spec.md`). That's not config
duplication anymore, it's _execution_ duplication — the actual thing worth
removing.

Sentinel is already deployed once, centrally, and already receives a
webhook for every PR across every installed repo. It's the natural place to
run a check like this exactly once per PR, for every repo, with **zero
per-repo config** — no devDependency, no CI job, nothing in
`holocron.config.ts` (commit rules don't vary by repo, so there's nothing
for `holocron.config.ts` to even declare).

## Why commit-message linting first

Sentinel's hard security boundary (D4/D6, `tech-sentinel-v1.spec.md`) is
"never read `holocron.config.ts` — or by extension, any file — from a PR
branch or fork; only ever the default branch." That boundary stays
untouched here. Commit-message linting doesn't need it touched at all:

- A PR's commits are fetched via `GET /repos/{owner}/{repo}/pulls/{pr}/commits`
  — plain metadata (SHA, author, **message string**), no file content, no
  code from the PR branch or fork involved anywhere.
- Linting a message string against a fixed rule set has zero execution
  surface — nothing from the PR is ever imported, required, or run.

This is safe from a fork PR, not just a same-repo one — no security
decision to make at all, unlike a hypothetical "read the PR's own
`holocron.config.ts`" proposal (out of scope here; would need its own
design and its own D4/D6 reconsideration if ever pursued).

It also directly proves the "Sentinel enforces centrally, zero per-repo
config" model with the simplest possible real case, before deciding whether
riskier checks (eslint, prettier — which _would_ need real PR file content)
are worth pursuing the same way.

## Decisions

### D1 — Real `commitlint`, real shared config, fed via API-sourced messages, not a git checkout

Sentinel invokes the actual `commitlint` Node API (or CLI via
`child_process`, TBD in implementation) with `@theholocron/commitlint-config`
as a real dependency — never a reimplementation of commitlint's rules.
CI's own `platform.commitStandards.yml` job feeds commitlint a git-log range
(`--from <base> --to <head>`, needs a real checkout); Sentinel can't do that
without a working tree, which D4/D6 deliberately avoids for the PR branch.
Instead, each commit _message_ fetched via the API is fed to commitlint
individually (its `--edit <file>`/stdin mode, the same mode the local
`commit-msg` hook already uses per-commit). Different transport, same
engine and same rules — this satisfies D8's intent ("never a bespoke
server-side-only implementation") even though the invocation shape isn't
byte-identical to CI's range mode; reimplementing the _rules_ in JS from
scratch would be the actual violation D8 warns against, and that's not what
this does.

### D2 — Scope: does this replace the existing CI job and local hook, or run alongside?

**Local `.husky/commit-msg` hook stays.** It catches a bad message before
the commit is even made — genuine, fast, local developer feedback Sentinel
can't replace (it only ever sees a _pushed_ PR).

**CI's `platform.commitStandards.yml` job is the actual redundant piece**,
once Sentinel's check is proven and made required: it re-checks the exact
same range the local hook should have already caught, at the cost of a full
runner + checkout + install per PR, for a check that never depends on
anything repo-specific. Once Sentinel's version is required, this workflow
(and the `@theholocron/commitlint-config` devDependency + `platform.commitStandards`
task entry) becomes a real deletion candidate per repo — its own "sweep,"
same shape as #680's Bucket A work, tracked as a PR-stack item below, not
done as part of proving the mechanism.

### D3 — Rollout: reporting-only before required, same as Capability Compliance

Ship the check posting but **not required** first. Verify against real PRs
across a few repos — including a deliberately bad commit message, to
confirm it actually _catches_ violations and isn't just always green (the
mistake this epic already made once with Capability Compliance, caught only
by pushing real traffic through it repeatedly). Only add it to a repo's
required-checks ruleset once proven there, one repo at a time — `clients`
first, matching the prototype-then-sweep pattern already established for
#680.

### D4 — `commitlint-config`'s remaining repo-specific override — confirmed already folded in

`tech-config-resolution.spec.md` flagged `holocron`'s own
`footer-max-line-length: [0]` override as something that should fold into
the shared `@theholocron/commitlint-config` package (every repo's commits
carry a `Signed-off-by:` trailer via `-s`, a universal need, not a
`holocron`-specific one). Checked while writing this spec: **already done**
— `configs/packages/commitlint-config/index.ts` carries the rule directly,
with a comment noting it was "previously only disabled in
theholocron/holocron's own local override." The shared package is already
the single source of truth Sentinel needs.

One small leftover: `holocron`'s own root `commitlint.config.ts` still
re-declares the same now-redundant rule on top of `extends: ["@theholocron"]`.
Harmless (duplicate, not conflicting), but a real Bucket A deletion
candidate — folded into this spec's PR-stack as a one-line cleanup rather
than filed as its own issue.

## Scope

- New Sentinel action (`packages/sentinel/src/actions/lint-commits.ts`,
  parallel shape to `sync-properties.ts`/`post-check-run.ts`): fetch PR
  commits, lint each message, aggregate pass/fail + which commit(s)
  violated which rule(s).
- New check run: `Sentinel / Commit Standards` (distinct from `Sentinel /
Capability Compliance`), wired into `handler.ts`'s pipeline for
  `pull_request.opened`/`pull_request.synchronize` only — this check is
  structurally PR-scoped, unlike capability compliance which also runs on
  `push.default-branch`.
- `@theholocron/commitlint-config` + `commitlint` become real Sentinel
  dependencies (`packages/sentinel/package.json`).
- No `holocron.config.ts` schema change — this needs zero per-repo
  declaration, by design.

## Out of scope (for now)

- eslint/prettier-as-Sentinel-enforcer — different risk profile (needs
  real PR file content, not just commit metadata); worth its own future
  design once this proves the model, not assumed to follow automatically.
- Reading a PR's own `holocron.config.ts` (vs. default branch) — a
  separate D4/D6 reconsideration, not needed for this slice.
- Autofix-on-push, PR comments — already tracked in #674.

## PR-stack

- [x] Confirm `commitlint-config`'s `footer-max-line-length` fold-in status
      (D4) — already done in `configs`.
- [ ] Drop the now-redundant duplicate `footer-max-line-length` rule from
      `holocron`'s own root `commitlint.config.ts` (small, standalone —
      doesn't block anything else here).
- [ ] `lint-commits.ts` action + `Sentinel / Commit Standards` check run,
      wired into the webhook pipeline for `pull_request.*` only.
- [ ] Verify live: a clean PR passes, a deliberately bad commit message on
      a throwaway PR is actually caught (not just always green).
- [ ] Make required on `clients` (prototype), same ruleset-PATCH mechanism
      already used for Capability Compliance.
- [ ] Sweep: make required across remaining repos, then remove the now-
      redundant `platform.commitStandards.yml` CI job + devDependency
      per repo (own PR-stack item, not bundled with proving the mechanism).
