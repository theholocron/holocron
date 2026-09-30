---
status: draft
issue: theholocron/holocron#860
blocked-by: []
related:
  - theholocron/holocron#769
  - theholocron/holocron#849
  - theholocron/holocron#858
  - theholocron/holocron#859
---

# Static analysis errors as PR reviews, not only check annotations

## Problem

Every Bucket 1 check (commit standards, alex, prettier, markdownlint,
eslint) posts findings as GitHub Checks API `output.annotations` on a check
run. Annotations show up inline in the "Files changed" diff view, but only
once a reviewer opens that tab specifically — there's no signal in the PR's
main conversation timeline the way an actual review has. Surfaced while
looking at real findings on `#859`: both the eslint and markdownlint
findings were real and correct, but readily missed without deliberately
checking the Checks tab.

## Decision: split eslint findings by severity, not a blanket swap

This is **not** a blanket swap of every Bucket 1 check's output to reviews.
Four of the five checks (commit standards, alex, prettier, markdownlint)
are single-outcome per run — pass or a fixed-shape finding — with no
severity axis to split on. Converting those to reviews would only move the
same volume of mechanical, low-stakes findings (a prettier disagreement, a
list-indent nit) into a heavier, more prominent surface — exactly the noise
this change is trying to avoid, not fix.

**eslint is the one check this applies to**, because `StaticAnalysisMessage`
already carries a real severity axis (`"error" | "warning"`, straight from
eslint's own `m.severity`, per `lint-static-analysis.ts`). The two
severities mean different things in this org's shared config: error-level
rules tend to be correctness-shaped (`@typescript-eslint/no-unused-vars`,
`n/no-unsupported-features/node-builtins`) — the class where a human might
actually want to respond or push back. Warning-level rules
(`vitest/no-disabled-tests`) are softer, advisory nudges — "you skipped a
test," not "this is broken." Split:

- **Warnings** stay exactly as today — check-run `output.annotations`,
  `output.text` keeps the full list, `conclusion: "neutral"` unchanged.
- **Errors** move to a PR review instead. **Excluded from
  `output.annotations`** (never posted twice — GitHub would show two
  separate inline markers on the same line, one from the check and one from
  the review, which is confusing, not additive) but still included in the
  check-run's `output.text` for the complete, permanent CI record.
- A PR with zero errors (clean, or warnings-only) gets **no review posted
  at all** — the check-run alone covers it, same as every other Bucket 1
  check today.

## Review shape

```text
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
{
  commit_id: context.headSha,
  event: "COMMENT",              // never REQUEST_CHANGES — advisory, same stance as conclusion: "neutral"
  body: <summary, see below>,
  comments: [
    { path: message.file, line: message.line, side: "RIGHT", body: <see below> },
    ...one entry per error-severity StaticAnalysisMessage
  ]
}
```

**Per-comment body** — GitHub anchors a review comment to a line, not a
column; column has to live in the text if it's worth keeping:

```text
`@typescript-eslint/no-unused-vars` (line 12, col 7): 'x' is defined but never used.
```

**Top-level review body** — has to make the split itself legible, or "why
did some findings show up here and not there" is a fair question from
whoever reads it:

```text
3 error(s) found by static analysis — see inline comments below.
2 warning(s) also found; see the Static Analysis check run for the full list.
```

One comment per error (not merged/deduplicated when multiple errors land on
the same line) — GitHub natively supports multiple threads stacking on one
line, and merging them loses the direct rule → line mapping a reviewer
would want to act on individually.

## Re-push behavior: post fresh each time, rely on native staleness marking

Considered and rejected: actively resolving/dismissing the prior push's
review via `resolveReviewThread` (GraphQL-only — no REST equivalent, and
`@theholocron/github-client` has no GraphQL capability today) before
posting a new one. Unnecessary: GitHub already marks a review comment
**"outdated"** and collapses it by default when a later push changes the
diff hunk the comment was anchored to — this is automatic, no bot action
required, and it already achieves the practical goal, that a reviewer
doesn't see a stale claim presented as current. The one real distinction
left — "outdated" (automatic, diff-position-based) vs. "resolved"
(manual/API, means "addressed") — only matters for a repo with "require
conversation resolution" branch protection enabled, which this org doesn't
use today. **Decision: post a new review on every relevant push
(`pull_request.opened`/`synchronize`), same scoping as the check-run itself;
do not build thread-resolution machinery.**

## Verified before writing this spec

- **`pull_requests: write` is already live** on the installed App —
  confirmed directly against the real installation
  (`gh api orgs/theholocron/installations --jq '.installations[] |
select(.app_slug == "the-holocron-sentinel") | .permissions'`), not
  assumed from docs. **`packages/sentinel/README.md`'s own permissions
  table is stale** — it documents `Pull requests: Read` ("required to
  _receive_ `pull_request` webhook events") and doesn't mention `actions:
write` at all (live, presumably from the Bucket 2 dispatch prototype's
  `workflow_dispatch` call) — both need correcting as part of this work,
  independent of whether the fix ships in the same PR.
- **No documented cap on the Reviews API's `comments` array** — checked
  GitHub's own REST docs directly; unlike the Checks API's explicit
  50-annotations-per-request limit, `POST /pulls/{number}/reviews` states
  no maximum. Real-world reports (GitHub community discussions, PyGithub/
  github-script issue trackers) describe undocumented instability with
  large single-request batches — `422: Unprocessable Entity: Review
comments is invalid` with no clear threshold GitHub has ever confirmed,
  and no consistent number across reports. **Not a "verified safe at N"
  finding — the opposite: confirmed this needs an empirical test against a
  real PR before shipping, not an assumed cap.** Design defensively:
  mirror the existing annotation-cap pattern (`post-static-analysis-check.ts`
  already caps at 50 and notes "N more, see check run" when truncated) —
  same shape here, but pick the actual number from a real test, not by
  analogy to the Checks API's unrelated limit.

## Implementation surface

- **New**: `@theholocron/github-client`'s `pulls.ts` needs a
  `createReview()` method — today it only has `getPullRequest`/
  `listCommits`/`listFiles`, nothing wrapping the Reviews API at all.
- **`lint-static-analysis.ts`**: no changes — `StaticAnalysisMessage`
  already carries everything needed (`severity`, `file`, `line`, `column`,
  `ruleId`, `reason`).
- **`post-static-analysis-check.ts`**: filter `output.annotations` to
  warnings only (currently all severities); errors excluded there, same
  `output.text` includes both as today.
- **New**: a `postStaticAnalysisReview()` (or folded into the existing
  post function — TBD at implementation time) that builds and submits the
  review, called only when the filtered error list is non-empty.
- **Docs**: `packages/sentinel/README.md`'s permissions table (the two
  stale entries above) and its own description of the static-analysis
  check's behavior.

## Explicitly out of scope

- The other four Bucket 1 checks moving to reviews at all — no severity
  axis to split on; they stay check-run-only.
- Thread resolution / `resolveReviewThread` — native "outdated" marking is
  sufficient (see above).
- A `holocron_profile`- or `runtime_environment`-driven opt-out for review
  posting specifically — not asked for; if a repo wants no reviews at all,
  that's a separate future knob, not assumed here.
