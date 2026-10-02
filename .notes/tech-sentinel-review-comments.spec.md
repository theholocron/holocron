---
status: draft
issue: theholocron/holocron#860
blocked-by: []
related:
  - theholocron/holocron#769
  - theholocron/holocron#849
  - theholocron/holocron#858
  - theholocron/holocron#859
  - theholocron/holocron#864
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

## Decision: split by severity where a real severity axis exists — not a blanket swap, and not uniform across all five checks

This is **not** a blanket swap of every Bucket 1 check's output to reviews,
and the five checks don't all land the same way. Each one was checked
individually against the actual API/data available, not assumed to behave
like the others:

### eslint and markdownlint — split by severity (this spec's actual scope)

Both have a **real, per-finding severity field** — not a conceptual
distinction, an actual value on the result object:

- **eslint**: `StaticAnalysisMessage.severity` (`"error" | "warning"`)
  already exists, straight from eslint's own `m.severity`
  (`lint-static-analysis.ts`). No code change needed to expose it.
- **markdownlint**: verified directly against the real `lint()` API
  (`markdownlint@0.41.1`, `>=0.39.0` required — satisfied) — each result
  message carries a real `"severity": "error" | "warning"` field, driven by
  each rule's own config (`{ rule: { severity: "warning" } }`, or the
  library's own default of `"error"` when unset). **Sentinel's own
  `MarkdownLintMessage` type doesn't expose this today** — `lint-markdown.ts`
  maps `e.lineNumber`/`e.ruleNames`/`e.ruleDescription`/`e.errorRange` but
  drops `e.severity` on the floor. Small, real code change needed: add
  `severity: e.severity` to the mapping.

Both mean the same thing in this org's shared config: error-level rules
tend to be correctness-shaped (`@typescript-eslint/no-unused-vars`,
`n/no-unsupported-features/node-builtins`) — the class where a human might
actually want to respond or push back. Warning-level rules
(`vitest/no-disabled-tests`) are softer, advisory nudges — "you skipped a
test," not "this is broken." Split, identically for both checks:

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
- **One review per check, not one combined review** — an eslint review and
  a markdownlint review are separate submissions when both have errors on
  the same push. They're different tools flagging different kinds of
  problems; merging them into one review body would only reintroduce the
  "why is this grouped with that" confusion the per-check split above
  exists to avoid at the check-run level already.

### Commit standards — categorically excluded, not only "no severity axis"

Checked `post-commit-standards-check.ts` directly: `CommitViolation` only
carries `sha`/`message`/`rule` — **no file, no line, at all.** Both
annotations and PR review comments are fundamentally diff-position-anchored
GitHub concepts; a commit message isn't part of a file diff, so there's
nowhere to attach either surface. This isn't "no severity axis to split
on" (the reason the next two checks are out of scope) — it's "there's no
diff position to attach anything to, categorically." Stays exactly as
today: a plain check-run conclusion + text summary, no annotations, no
review, regardless of severity.

### Prettier — not an annotations-vs-reviews question at all; resolved separately

A prettier finding is 100% mechanical and deterministic — there's no
judgment call for either surface to help a human make, because the tool
itself already knows the exact correct output. The right fix was never
"surface it more visibly" (via review or annotation), it was "apply it
directly" — which `commitFormattingFix` (`#820`) has done since it shipped,
opt-in per repo. Verified live: `holocron.config.ts` itself never opted in,
so this repo's own PRs hit exactly the "surface a mechanical fix as a
finding" problem this spec set out to fix, for a tool that could have
already fixed it outright.
**Resolved in `#864`**: `autoFix` flips from opt-in to default-on
(opt-out via an explicit `{ with: { autoFix: false } }`), verified against
all three main repos' rulesets first (`dismiss_stale_reviews_on_push:
false`, `required_approving_review_count: 0` — no fallout from a bot
pushing a commit). Once a repo is on the default, prettier findings on its
PRs mostly stop existing rather than needing a better way to display them.
A repo that explicitly opts back out still gets the original
check-run-only annotation behavior, unchanged by this spec.

### Alex — explicitly out of scope; needs its own new mechanism first

Alex has **no native severity axis at all** — checked directly against
real output: every alex finding comes back `fatal: false`, unconditionally,
regardless of which word or rule fired (`retext-equality`/
`retext-profanities` under the hood). Unlike eslint/markdownlint, there's
no config knob to flip per-word severity today. Doing the equivalent split
for alex means building a **new org-side classification layer from
scratch** — e.g. a term → severity map the org would have to author and
maintain (which words are "we've already decided this is a real problem"
vs. "advisory, use judgment"), not a config value that already exists
upstream. Real, valuable, genuinely separate scope — tracked as a follow-up
issue, not folded into this spec.

**Update: shipped, differently than predicted (holocron#865).** A per-word
map turned out to be the wrong shape once the real ruleset was inspected —
`retext-equality`'s 425 patterns split into exactly three categories (`a`,
`male`, `female`), and the org decided the entire plugin is one
already-decided bucket rather than something needing word-by-word
curation. Shipped as a plain per-source/category rule in
`post-inclusive-language-check.ts`: every `retext-equality` finding is
`"error"` unconditionally; `retext-profanities` still splits on its own
real `profanitySeverity` signal. No new org-side map needed after all —
this is still **not** wired into the review-posting mechanism this spec
describes (alex still posts check-run annotations only), but it does mean
alex's severity signal no longer needs inventing if a future version of
this spec's own review split ever reaches alex.

## Review shape (eslint and markdownlint, identical mechanism)

```text
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
{
  commit_id: context.headSha,
  event: "COMMENT",              // never REQUEST_CHANGES — advisory, same stance as conclusion: "neutral"
  body: <summary, see below>,
  comments: [
    { path: message.file, line: message.line, side: "RIGHT", body: <see below> },
    ...one entry per error-severity message
  ]
}
```

**Per-comment body** — GitHub anchors a review comment to a line, not a
column; eslint's column has to live in the text if it's worth keeping
(markdownlint's `errorRange` is `[startColumn, length]`, same treatment):

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

## Findings outside the PR's diff (holocron#906)

GitHub only accepts a review comment on a line that is part of the PR's
diff, and a single out-of-diff comment makes it reject the **whole**
review with a 422. Errors on unchanged lines of a changed file are
common. actionlint (#904, which joined eslint and markdownlint on this
mechanism) reports a `needs:` mistake at the job key, and any rule can
flag a line next to the edit. When the review was rejected, the check
run still failed, but the inline signal was lost entirely.

`postErrorReview()` now fetches the PR's files and splits errors against
each file's unified-diff `patch` hunks (`commentableLines()`: every
RIGHT-side context or added line):

- In-diff errors stay inline comments, unchanged.
- Out-of-diff errors are listed in the review body as
  `` `file:line` — <comment body> ``. A review is still posted when every
  error is out of the diff, or when a file has no `patch` (GitHub omits
  it for binary files and very large diffs).
- Thread resolution is unchanged. Body-listed findings have no thread,
  and a still-current finding's old thread stays open even after its
  line drops out of the diff.

`@theholocron/github-client` declares `GitHubPullRequestFile.patch` as of
1.35.0 (theholocron/clients#384).

## Re-push behavior: this org requires thread resolution — native "outdated" marking is not sufficient

**This reverses an earlier draft of this decision.** The first pass of this
spec concluded that posting a fresh review on every push and relying on
GitHub's native "outdated" comment-collapsing (automatic when a later push
changes the diff hunk a comment was anchored to) was sufficient, and that
building `resolveReviewThread` (GraphQL-only, no REST equivalent) wasn't
worth it — reasoning that the "outdated ≠ resolved" gap "only matters for a
repo with 'require conversation resolution' branch protection enabled,
which this org doesn't use today."

**That assumption was wrong, checked directly against the live rulesets**:

```text
gh api repos/theholocron/holocron/rulesets/<id> --jq \
  '.rules[] | select(.type == "pull_request") | .parameters.required_review_thread_resolution'
# → true, on all three main repos (holocron, clients, configs)
```

With `required_review_thread_resolution: true` live everywhere, an
unresolved review thread — including a stale one Sentinel itself posted for
an error that's since been fixed — **blocks every future merge on that PR**
until a human manually resolves it. "Outdated" only greys the thread out
visually; it does not satisfy this ruleset requirement. Nobody would think
to manually resolve a bot's own stale comment as part of normal review
flow, so left unhandled this would turn into a recurring, confusing piece
of merge friction on every PR that ever had a transient eslint/markdownlint
error — worse than the annotations this spec is trying to improve on.

**Revised decision**: Sentinel must resolve its own prior review's threads
before (or alongside) posting a new one, using the GraphQL
`resolveReviewThread` mutation. `@theholocron/github-client` has no GraphQL
capability today — this is real, new implementation surface, not a
mechanical addition alongside the REST `createReview()` method. Scope for
implementation time: resolve only threads whose original finding no longer
appears in the current push's error list (i.e., actually fixed), not
every thread indiscriminately — a still-current error's thread should stay
open, since resolving it too would suppress a real, unaddressed finding at
next glance.

## Verified before writing this spec

- **`pull_requests: write` is already live** on the installed App —
  confirmed directly against the real installation
  (`gh api orgs/theholocron/installations --jq '.installations[] |
select(.app_slug == "the-holocron-sentinel") | .permissions'`), not
  assumed from docs. **`packages/sentinel/README.md`'s permissions table
  was stale** (documented `Pull requests: Read`, didn't mention `actions:
write` at all) — corrected in `#864`.
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
- **`required_review_thread_resolution: true` is live on all three main
  repos** (holocron, clients, configs) — checked directly against each
  repo's ruleset, not assumed. This reversed the re-push design (see
  above) — the single most load-bearing verification in this spec, since
  getting it wrong would have shipped a feature that quietly blocks merges.
- **`dismiss_stale_reviews_on_push: false` and
  `required_approving_review_count: 0`** on all three repos — checked while
  verifying the auto-fix-commit default flip (`#864`), not this spec's own
  concern directly, but confirms an auto-fix commit (which itself triggers
  a new push) can't interact badly with review state either.

## Implementation surface

- **New**: `@theholocron/github-client`'s `pulls.ts` needs a
  `createReview()` method — today it only has `getPullRequest`/
  `listCommits`/`listFiles`, nothing wrapping the Reviews API at all.
- **New**: `@theholocron/github-client` needs a GraphQL capability for
  `resolveReviewThread` — no GraphQL surface exists in the client today at
  all; this is new infrastructure, not only a new method on an existing
  REST wrapper.
- **`lint-static-analysis.ts`**: no changes — `StaticAnalysisMessage`
  already carries everything needed (`severity`, `file`, `line`, `column`,
  `ruleId`, `reason`).
- **`lint-markdown.ts`**: real change needed — `MarkdownLintMessage` drops
  `severity` on the floor today; add it to the mapping from markdownlint's
  raw result.
- **`post-static-analysis-check.ts` / `post-markdown-lint-check.ts`**:
  filter `output.annotations` to warnings only (currently all severities)
  in both; errors excluded there, `output.text` keeps both as today.
- **New**: a review-posting function per check (eslint, markdownlint),
  called only when the filtered error list is non-empty, plus the
  prior-thread-resolution step described above.
- **`@theholocron/markdownlint-config`**: decide which MD0xx rules (if any)
  should be configured `severity: "warning"` rather than the library's own
  default of `"error"` — an org-judgment call, same shape as `ALEX_CONFIG`'s
  existing allow-list, not yet made.
- **Docs**: `packages/sentinel/README.md`'s description of the
  static-analysis and markdownlint checks' behavior (permissions table
  itself already corrected in `#864`).

## Explicitly out of scope

- **Commit standards** moving to either surface — categorically excluded,
  no file/line to attach to (see above).
- **Prettier** moving to either surface — resolved via default-on auto-fix
  instead (`#864`); not an annotations-vs-reviews question.
- **Alex** moving to either surface — its severity axis now exists
  (`#865`, error/warning by source/category), but wiring it into a
  review-posting mechanism is still separate, unstarted scope, not folded
  into this spec.
- A `holocron_profile`- or `runtime_environment`-driven opt-out for review
  posting specifically — not asked for; if a repo wants no reviews at all,
  that's a separate future knob, not assumed here.
