---
status: draft
issue: theholocron/holocron#769
blocked-by: []
related:
  - theholocron/holocron#672
  - theholocron/holocron#679
  - theholocron/holocron#771
  - theholocron/holocron#772
  - theholocron/holocron#680
  - theholocron/holocron#787
  - theholocron/holocron#789
---

# Sentinel as centralized CI runner

## Relationship to prior specs

Three specs already exist for adjacent pieces of this. This one doesn't
replace them — it's the next phase, built on top, with exactly one explicit
amendment called out below (D6-amended).

- **`.notes/tech-holocron-platform.spec.md`** (epic #672) — the parent spec.
  Named the root problem ("repos own configuration that should be
  platform-owned"), designed the intent vocabulary rename (D3, shipped),
  custom-properties sync (D5, shipped — `holocron_profile`/
  `holocron_capabilities`/`holocron_stack`/`holocron_compliance`), the
  "Config resolution" Bucket A/B/C split (still the right frame — see
  below), and D6, the security boundary this spec amends.
- **`.notes/tech-sentinel-v1.spec.md`** (issue #679) — the App itself:
  webhook receiver, `validateConfig()`, deploy-target ADR (Vercel Functions).
  Shipped. Nothing here changes that mechanism — Sentinel still validates
  `holocron.config.ts` the same way; this spec is about what Sentinel does
  _in addition_.
- **`.notes/tech-sentinel-enforcement.spec.md`** (issue #769) — the pivot
  from "Sentinel reports" to "Sentinel enforces," commit-standards as the
  first real check, D1–D6 there (own numbering, not the epic's). Shipped
  and live (#769/#771/#776–#789). This spec is the _next_ enforcement
  target after commit-standards: everything else that's currently
  duplicated per-repo tooling.

**Why this spec exists**: the actual target kept moving across several
redesigns in the same conversation, because the ask — "Sentinel becomes a
centralized CI runner, not just a policy-check poster" — hadn't been stated
plainly until now. Capturing it once, completely, so the next round of work
doesn't re-derive it from scratch.

## Problem

Confirmed today: the "Config resolution" mechanism in the epic spec (Bucket
A — `astromech` resolving `--config <shared path>` instead of tool
auto-discovery) is already built and working (`packages/astromech/src/run.ts`,
`resolveToolConfig`). But the migration pass to actually _remove_ the
now-redundant per-repo config files (#680) never ran — `clients`, meant to
be the first prototype repo, still has all ~45 of them (15 packages ×
`eslint.config.ts`/`vitest.config.ts`/`tsdown.config.ts`). The mechanism
solving "one shared config" already exists; what's missing is (a) actually
using it everywhere, and (b) going further than the original plan ever
scoped — Sentinel _running_ checks centrally, not just each repo's own CI
pointing at a shared config file.

## The core split: not a security boundary, an execution-environment question

**D6 in the epic spec** ("the App only ever reads config from the default
branch, never a PR branch or fork") was written for a threat model this org
doesn't have: **this tool has no external/fork contributors — internal use
only.** That fact changes what's actually being protected against.

### D6-amended

**Original D6**: App never reads a PR/fork branch — a blanket ban, framed as
"no new trust boundary is introduced."

**Amendment**: with no fork-PR threat model, Sentinel reading (and in some
cases executing) a **same-repo** PR branch's content is no riskier than what
GitHub Actions _already does today_ for every normal PR in this org — Actions
checks out and runs PR-branch code with full secrets access by default for
non-fork PRs, because GitHub's own trust model already treats same-repo PRs
as trusted. D6's blanket ban is more conservative than this org's actual
threat model calls for.

**What doesn't change**: a GitHub App installation token is a real
credential. "No forks" removes the _malicious external actor_ case, not the
_general caution around running arbitrary code with elevated credentials_
case — a typo'd PR or a compromised dependency pulled in by a trusted PR
could still misuse the token if Sentinel's own process executes untrusted
code carelessly. Not a blocker, just don't build recklessly. **If this org
ever accepts external/fork contributions, this amendment needs to be
revisited before anything below runs against a fork.**

### The real dividing line: full checkout+install vs. file content alone

Not "which specific tools" (that list isn't exhaustive and shouldn't be
hand-maintained — see D11 in the epic spec, one canonical table, not
scattered enumeration) — the line is **does the check need the whole repo
tree + a dependency install to run, or does it operate on fetched file
content alone**:

**Bucket 1 — file content only, runs centrally in Sentinel.** Static
analysis: parses text, applies rules from a trusted shared config, never
`import()`s or executes the repo's own code. Same proven shape as
commit-standards today (fetch data via the GitHub API, lint with a trusted
library, post a check). Candidates: commitlint (done), yamllint, actionlint,
alexjs, gitleaks, editorconfig-checker, eslint (see caveat below). Per-repo
config files for these disappear entirely — genuinely "1 config," the
original epic's own founding complaint, closed all the way down.

**Bucket 2 — needs full checkout + install, dispatched to a shared `.github`
workflow.** `tsc`, `vitest`, `tsdown`/build, and eslint _unless_ the preset
caveat below is resolved first. These fundamentally need the repo's own
dependency tree installed and real code execution (type resolution walks
real imports; tests run real files) — a materially bigger, longer-running
operation than "fetch one file's content." GitHub Actions' per-run isolated
runner is already well-suited to this regardless of trust; a serverless
webhook handler (Sentinel's actual shape — tight execution-time ceilings, no
warm `node_modules` cache across invocations) isn't a natural fit for it.
**What moves is trigger ownership, not execution**: instead of each repo's
own thin-caller `.github/workflows/*.yml` file firing on its own `on:
pull_request`, Sentinel dispatches one canonical workflow living in
`.github` — see mechanism below. Per-repo thin-caller _files_ disappear;
Actions itself stays exactly where it already works.

**eslint's caveat**: today its per-repo `eslint.config.ts` carries real
content beyond the shared bundle (confirmed during #680's investigation —
every one of `clients`' 16 files has genuine per-package deltas, minimum
`ignores: ["dist/**", "coverage/**"]`, `github-client` has a Web Crypto
override). That's not inherent to the tool — it's a consequence of
`@theholocron/eslint-config` not yet having a preset system expressive
enough to cover the real variation, the same gap `@theholocron/holocron-config`
already closed for `holocron.config.ts` itself (`compose`/`react`/`node`/
`nextjs` presets). The building blocks already exist and are already
trusted, synced signal: `holocron_profile` (`library | cli | plugin |
template | app | docs | platform`, derived) and `runtime_environment`
(`node | browser | universal | none`, explicit config field) — both already
read by Sentinel via `validateConfig()`. Once `eslint-config` grows a preset
system keyed on that vocabulary, eslint moves from Bucket 2 to Bucket 1: no
per-repo config needed, no PR-branch code to read, Sentinel selects the
right preset centrally from already-known, already-trusted signal.

**knip — verified (#796): neither bucket cleanly, lands in Bucket 2.** Its
whole purpose is "is X used _anywhere_ in the codebase" (unused exports,
unused dependencies) — inherently whole-repo-scoped, since answering that
for even one changed file means cross-referencing every _other_ file, not
just the changed set. Doesn't fit Bucket 1's "single file's content" shape
at all, changed-files scoping or not.

Not clean Bucket 2 either, strictly — it doesn't need `npm install` + real
code execution (no type-checking, no running tests, just AST-level
import/export tracing across relative paths). It needs the _whole file
tree's content_, not the ability to execute it — a genuine third shape.
Sentinel could technically fetch that (it already does recursive
`git.getTree()` walks for other purposes, per `tech-sentinel-v1.spec.md`),
but fetching every file in a large repo via the GitHub API on every PR push
is a much heavier operation than any Bucket 1 tool does today, and risks
the same Vercel time/response-size ceilings Bucket 2 exists to avoid — a
real checkout is actually _cheaper_ to get "every file's content" than N
individual API calls, even without needing an install step. **Verdict:
knip rides the Bucket 2 dispatch mechanism once built** (checkout, skip the
install step if genuinely unneeded, run knip) — not because of execution
risk, but because of the resource shape.

## D8, reaffirmed and now applied uniformly

The epic spec's D8 ("everything CI runs must be reproducible locally via
`holocron`, no CI-only or App-only logic path... one engine, three callers")
already existed. This spec doesn't add a new principle — it closes the gap
where it wasn't yet uniformly true: **both buckets execute through
`holocron run <task>` (or its programmatic equivalent)**, not two
implementations to keep in sync. A developer running `holocron ci` locally,
the `.github`-dispatched Bucket 2 workflow, and Sentinel's own Bucket 1
static-analysis runs all resolve through the identical path. Bucket 1's
in-Sentinel execution should call the same real library APIs
`lint-commits.ts` already established the pattern for (real `@commitlint/lint`,
not a reimplementation) — the equivalent for eslint/yamllint/etc. is their
own real lint APIs, not hand-rolled rule checking.

## Bucket 2 mechanism — dispatch to `.github`, no per-repo thin-callers

1. Sentinel receives the webhook (already does this) — already knows repo,
   ref, PR/commit SHA.
2. Sentinel calls `POST /repos/theholocron/.github/actions/workflows/{id}/dispatches`
   with `inputs: { repo, ref, ...task selector, a unique correlation id }` —
   a workflow that lives _only_ in `.github`.
3. That workflow's `actions/checkout@v4` step uses
   `with: { repository: ${{ inputs.repo }}, ref: ${{ inputs.ref }} }` to
   check out the _target_ repo, not `.github`'s own — using a fresh
   installation token Sentinel generates via its existing
   `createInstallationClient()` machinery, passed through as a dispatch
   input/secret (no new auth infrastructure — reuses what already exists).
4. It runs `holocron run <task>` against the checked-out code — identical
   command to what the thin caller runs today, identical to what a
   developer runs locally.
5. It posts/patches a check run on the **target** repo (not `.github`) via
   the Checks API, using the same installation-token mechanism
   `postCheckRun`/`postCommitStandardsCheck` already use. `details_url`
   points at the dispatched run's own page in `.github`'s Actions tab —
   giving a real, native, live-streaming GitHub log viewer, something
   neither existing Sentinel check has today (they're pure API posts with
   no workflow behind them — the exact gap that motivated `output.text` +
   the Axiom `details_url` fallback last session).

**Known complication, not a blocker**: `workflow_dispatch` is fire-and-forget
— the trigger API call returns immediately with no run ID, so Sentinel can't
directly correlate "which run did this dispatch produce" from the response
alone. The unique correlation id threaded through as an input (step 2) is
how the dispatched workflow's own check-run-posting step (step 5) ties back
to the right check run Sentinel posted as `"queued"` immediately after
dispatching.

**What this does and doesn't change**: real, meaningful — collapses N
physical thin-caller files into one canonical, `holocron`-CLI-invoking
workflow, with Sentinel (already importing astromech's canonical task
table, D11) as the single place deciding what runs, closing the epic spec's
own still-open question ("the caller file itself still physically exists in
every repo... whether it needs to"). Doesn't change: execution cost, billing,
or where the actual work happens — still real Actions runner time, same
checkout+install+run shape as today.

## New capabilities needed (not yet built)

1. **Changed-files list for a PR** — `pulls.listFiles()` or equivalent on
   `@theholocron/github-client`. Bucket 1 tools need this to scope
   correctly ("only run alexjs on markdown changes," "only run actionlint
   on workflow-file changes") — the same shape `pulls.listCommits()` had to
   get added for commit-standards (`clients`#355).
2. **Inline review comments / annotations** — a different GitHub API
   surface than a check-run summary: either `pulls.createReviewComment()`
   or a check run's `output.annotations` array (file+line-anchored). Needed
   for "alexjs should post review comments where appropriate" — neither
   exists in Sentinel or `github-client` today.

## Scope for this phase

**In:**

- eslint preset-parameterization design (keyed on `holocron_profile`/
  `runtime_environment`) — prerequisite for eslint to reach Bucket 1.
- One Bucket 1 tool prototyped end-to-end beyond commitlint (candidate:
  yamllint or alexjs — smallest surface, no changed-files dependency for a
  repo-wide-only version, though alexjs specifically wants changed-files
  scoping to be genuinely useful).
- The `pulls.listFiles()` capability (`github-client`).
- One Bucket 2 tool prototyped through the full dispatch mechanism
  end-to-end (candidate: `verification.typeSafety`/`tsc` — deterministic
  pass/fail, no flaky-test surface to complicate the first prototype).
- knip's actual technical requirements, verified.

**Out (this phase):**

- Inline review comments/annotations capability (needed eventually for
  alexjs specifically, not blocking the rest).
- Sweeping every tool across every repo — mirrors the "prototype then
  sweep" shape #680/#680-adjacent work already established; don't
  generalize until one tool per bucket is proven.
- Any fork-PR support — explicitly out until/unless this org's contribution
  model changes (see D6-amended).

## Open questions

- Exact Bucket 2 dispatch payload shape (task selector: one task per
  dispatch, or a batch?) — resolve during the `tsc` prototype, not here.
- Whether Bucket 1's per-tool config (commitlint-config-shaped packages for
  yamllint/alexjs/etc.) already exist in `@theholocron/configs` or need
  building — check per tool during implementation.
- Whether the eslint preset system, once built, should also become the
  mechanism `holocron-config`'s own `react()`/`node()` presets compose
  through, or stay a separate package — design question for that specific
  sub-piece, not this spec.

## PR-stack

Not yet decomposed into issues — file sub-issues under #769 once this spec
moves past `draft`, matching #771's own PR-stack precedent (prototype
issue, sweep issue, one per genuinely-separable piece).
