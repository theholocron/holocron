---
status: draft
issue: theholocron/holocron#945
blocked-by: []
related:
  - theholocron/holocron#940
---

# Sentinel's deploy architecture: is a redeploy-on-every-release serverless Function still the right shape?

## Context

Two independent findings, same root cause:

1. Vercel's Hobby-tier Fluid Active CPU meter hit 75% of its 4-hour
   monthly allotment, driven by Sentinel's in-process linting work
   (ESLint/markdownlint/actionlint/etc. on every PR, org-wide) —
   `tech-sentinel-deploy-target-netlify.spec.md`'s original motivation.
2. Netlify's free tier turned out to be credit-metered, not
   invocation-metered: 300 credits/month, 15 per production deploy, hard
   stop with no overage. Checking this org's own `deploy-on-release`
   trigger (`channel: "alpha"`, paths = Sentinel + its three
   `workspace:*` deps `@theholocron/cli`/`astromech`/`datapad`) against
   the last 15 alpha releases: **14 of 15 would have redeployed
   Sentinel.** At 15 credits each, that exhausts the entire monthly
   allowance in under a week — see the correction appended to
   `tech-sentinel-deploy-target-netlify.spec.md` for the full numbers.

Both findings trace back to the same two structural facts about
Sentinel's current shape, independent of which vendor it runs on:

- **It redeploys far more often than its own code actually changes.**
  `deploy-on-release.ts`'s path-based heuristic (redeploy if the release
  touches the package's own folder _or any_ `workspace:*` dependency
  folder) is a conservative default that produces a lot of false
  positives for packages like `@theholocron/cli` — most changes there
  (e.g. a `plugin create` scaffold-template fix) never touch anything
  Sentinel's bundled `dist/index.mjs` actually imports, but still count
  as "touched" and trigger a redeploy.
- **It's billed as a Function (FaaS), where the two meters that matter —
  CPU-active-time and deploy-count — both scale with exactly the access
  pattern Sentinel has**: bursty, CPU-heavy work (real linting) and
  frequent redeploys (one per relevant release). An always-on process
  bills neither of those things; it bills wall-clock uptime, which
  doesn't care how often the underlying code changes or how much CPU a
  given request consumes within a flat capacity.

## Open question

Is "serverless Function on a provider with a generous free tier" even
the right shape for Sentinel, or should the fix be architectural: an
always-on API-driven app instead? ADR-0011 chose Vercel Functions over
Cloudflare Workers for a runtime-constraint reason (`validateConfig()`
needs a writable filesystem + real dynamic `import()`, which V8 isolates
don't have) — that reasoning doesn't rule out an always-on _Node.js_
process, only V8-isolate edge runtimes. It does rule self-hosting out
once already, for adding operational surface nothing else in the org
carries — worth re-litigating given new information, since a managed
always-on platform (not a bare VPS) may not actually carry that same
burden.

## Candidates to weigh (none chosen yet)

### A. Keep Functions, throttle the redeploy trigger

Lowest effort. Narrow `deploy-on-release.ts`'s redeploy decision from
"the release touched this path" to something closer to "Sentinel's
actual built output changed" — e.g. diff `dist/index.mjs`'s content hash
across releases rather than source paths, or move Sentinel off
`channel: "alpha"` onto a scheduled/batched cadence (redeploy at most
once/day, picking up whatever's latest). Fixes the deploy-count meter on
any FaaS platform; doesn't address Vercel's CPU-active-time meter if the
"stay on Vercel" branch of this decision is revisited too, since that one
scales with request volume/linting work, not deploy frequency.

### B. Always-on API app

Move off Functions entirely — a small Node.js process on a platform
billed by uptime/compute allocation rather than invocations or deploys.
Decouples both meters Sentinel has hit so far. Revisits ADR-0011's
self-hosting rejection, which this spec should either confirm still
applies or explicitly narrow (managed always-on platform vs. literal
self-hosted VPS are not the same operational burden). **Evaluated in
detail below (2026-10-06 follow-up) — every concrete candidate found has
a real, disqualifying downside for this org's actual requirement (a real
enforced spend cap, not an engineered-but-still-metered ceiling).**

### C. Fix the redeploy heuristic AND keep the provider question open

Not mutually exclusive with A or B — the path-based over-triggering in
`deploy-on-release.ts` is arguably a bug regardless of where Sentinel
ends up hosted (other current/future packages using `on: "release"`
have the same false-positive exposure, without a billing cliff to
surface it). Worth fixing on its own merits even if the hosting
question is settled separately.

## Candidate B, evaluated in detail (2026-10-06 follow-up)

The hard requirement driving this evaluation: **an actual enforced cap
that prevents spend, not an engineered ceiling that merely bounds it
mathematically.** Every "always-on, flat-billed" candidate researched
fails that bar, in a different way:

- **Fly.io** — no free tier exists anymore as of 2026 (deprecated in
  2024; only pre-2024 legacy accounts keep the old allowance).
  This org isn't one. Real money from day one — disqualified on cost
  alone, before the spend-cap question even applies.
- **Render (free web service tier)** — genuinely $0, not metered at all,
  so there's nothing to "overage" into — the free tier itself _is_ the
  cap, trivially. But it sleeps after 15 minutes idle with a **30–50
  second cold start** on wake. For a webhook that gates PR checks across
  the org, that's a worse UX trade than the CPU-metering problem it
  would replace — a latency risk, not a financial one, but a real one.
- **Cloudflare Containers** — a genuinely different runtime than
  Cloudflare Workers (real Linux containers, real filesystem, no V8
  isolate — confirmed via Cloudflare's own docs: "isolated Linux
  containers... standard Linux filesystem where you can read and write
  anywhere you have permissions," distinct from Workers' isolate model).
  Satisfies `validateConfig()`'s filesystem/dynamic-import requirement
  trivially — this is **not** what ADR-0011 rejected. Requires the $5/mo
  Workers Paid plan (no free tier for Containers at all). **Cloudflare's
  billing has no real spend cap — only email budget alerts, informational
  only, confirmed via Cloudflare's own billing docs**: "Budget alerts are
  informational only. They do not pause or cap usage." `max_instances`
  (Containers' own scaling config) can *engineer* a mathematically
  bounded worst case — e.g. `max_instances: 1` + the smallest viable
  instance size caps the absolute worst case (one instance pinned at
  100% utilization, 24/7, all month) at roughly $20–25/month including
  the base fee — but that's a config-enforced ceiling, not a billing-system
  enforced one. **Rejected**: doesn't meet the actual requirement (a cap
  that _prevents_ spend), regardless of how tight the engineered bound is.
- **Vercel Pro's Spend Management** — the one candidate with a real,
  platform-enforced pause mechanism (confirmed: "pause production
  deployments" when a configured spend threshold is crossed). But it's
  not an instant wall: usage is checked every few minutes, not
  continuously, so a sharp spike can accumulate real charges before the
  pause fires; when it does fire, it's all-or-nothing (the entire
  production deployment goes offline, not only the overage), and
  projects don't auto-resume — manual action required. $20/month per
  seat on top of that. A real cap, but a reactive, delayed, blunt one —
  and not free.
- **AWS Lambda** — no built-in cap at all; would need a CloudWatch
  billing alarm plus custom automation to actually disable the function
  on breach. More to build than any of the above, for a result no better
  than Vercel Pro's imperfect one.

**Netlify reframed, not re-ruled-out**: the original Netlify finding
above was never "it has no cap" — it already hard-stops at 0 credits,
full stop, no overage. Because it's a discrete per-deploy charge (checked
before a deploy starts) rather than a continuous usage estimate, it has
no "minutes of exposure during a spike" window the way Vercel Pro's
reactive check does — structurally closer to a true instant stop. The
actual problem was always the _redeploy-cadence_ mismatch (Candidates A/C
above), not a missing cap. Fixing that stays the one path that's both
free and has a real, clean enforced ceiling already built — **if** the
redeploy-cadence fix alone is enough (see next section for why it might
not move the needle on Sentinel's underlying CPU cost either).

## A different lever entirely: make Sentinel itself cheap, regardless of platform

This started as a provider search but surfaced something more
fundamental while discussing it: **Sentinel's own CPU-heavy in-process
linting — not the hosting provider — is the actual root cost**, and an
already-drafted, partially-shipped spec
(`.notes/tech-sentinel-ci-runner.spec.md`, issue #769) is directly
relevant.

That spec splits every CI check into two buckets: **Bucket 1** (file
content only — commitlint, eslint, markdownlint, actionlint, formatting,
DCO, inclusive-language) runs centrally **inside Sentinel itself**, by
design. **Bucket 2** (needs a real checkout + dependency install — `tsc`,
`vitest`, builds) dispatches to a workflow living in `theholocron/.github`
instead of a per-repo thin-caller file — already built and live for
exactly one task (`verification.typeSafety`), running alongside the
existing thin-caller in shadow mode, not yet trusted to replace it.

**The tension**: Bucket 1 is exactly the CPU-heavy work driving Vercel's
Active-CPU meter in the first place (real `ESLint.Linter.verify()`,
markdownlint, actionlint's WASM run, on every PR org-wide). Finishing
that spec as currently scoped — more tasks moving _into_ Sentinel's own
centralized execution over time — pushes Sentinel's CPU cost the wrong
direction, not the right one. "Sentinel becomes a centralized CI runner"
and "reduce Sentinel's hosting cost" are in genuine conflict as specced.

**The open question this surfaces**: should Bucket 1 _also_ dispatch to
`.github`, not only Bucket 2 — making Sentinel a near-zero-compute relay
(verify webhook, dispatch, post check) regardless of which checks run,
decoupling the entire platform-selection question from Sentinel's actual
compute footprint? Checked the real numbers before treating this as free:

- `theholocron` is on the GitHub Free plan: 19 public repos, exactly one
  private repo (`.github-private`). **Public repos get unconditionally
  free, unlimited Actions minutes on any plan** — no metering at all,
  regardless of volume. Since `holocron`/`.github` (where dispatched
  workflows actually run) are public, dispatching more Bucket 1 checks
  there costs **$0 in Actions minutes**, confirmed against the org's own
  billing-usage API (`.github-private`'s actual recent usage: 862, 428,
  1478, 447, 592, 823 minutes across six months, `netAmount: 0.0` every
  month — nowhere close to the Free plan's 2,000-minute private
  allowance).
- The real cost isn't money, it's **latency**: a dispatched Actions run
  pays runner-provisioning + checkout + install overhead that in-process
  linting doesn't. Each would land somewhere around 20–45 seconds
  end-to-end instead of near-instant (see caching note below for why
  it's that range and not worse).
- The other real constraint is **concurrency**, not cost: Free-plan orgs
  get 20 concurrent Actions jobs; beyond that, excess jobs queue rather
  than fail or bill extra. Only matters under genuinely heavy simultaneous
  org-wide PR activity.

**A batching idea was raised and rejected.** The thought: dispatch
multiple moved tasks in _one_ combined workflow run (one checkout, one
install, tasks run sequentially) instead of one dispatch per task, to
avoid paying setup overhead N times. Correctly pushed back on: taken to
its conclusion, that logic justifies merging _every_ task into one
monolithic workflow file, since they all share the same checkout+install
— unmaintainable, noisy combined logs, and unclear which part broke when
something fails. **Rejected in favor of keeping each task as its own
separate dispatched workflow/job**, because the premise (shared setup is
expensive, so merge) turned out to overstate the actual cost:
`setup-node.yml` already sets `cache: pnpm` on `actions/setup-node`
(cached install, not a cold one), and `setup.yml` already caches `.turbo`
via `actions/cache` with an OS-scoped fallback key — both already live,
today, for every existing job. Extending Bucket 2-style dispatch to more
tasks means leaning on caching that already exists, not inventing
anything, and keeps every task's workflow small, independently
reviewable, and quick to debug when one fails.

**Net effect, if pursued**: potentially a real, structural answer to the
entire multi-day question — not "which platform is cheapest" but "make
Sentinel's own compute footprint small enough that the platform barely
matters." Not decided; raised here as the most promising unexplored
direction, separate from the narrower redeploy-cadence question in
Candidates A/C above.

## What's parked, not abandoned

The Netlify migration code (plugin, client, Sentinel's stage-deploy
rewrite, Lambda-handler adapter, CI workflow token swap) is finished on
a branch/PR per `tech-sentinel-deploy-target-netlify.spec.md`, explicitly
**not merged** — it's the concrete deliverable if option A (or A+B later)
lands on "Netlify is fine once the redeploy cadence is fixed." Nothing in
it is wasted regardless of which option below gets picked: the
`holocron-plugin-netlify` / `@theholocron/netlify-client` packages are
already merged as general-purpose org infrastructure, usable by any
future service this org deploys there, independent of Sentinel's own
outcome.

## Next step — paused, 2026-10-06

**No decision made.** Every concrete option evaluated has a real,
disqualifying downside for this org's actual requirement (an enforced
spend cap, not an engineered one) or a real UX cost (cold starts,
dispatched-check latency): Cloudflare Containers has no enforceable cap
at all; Vercel Pro's cap is real but reactive, delayed, and
all-or-nothing, plus a real recurring cost; Fly.io's free tier no longer
exists; Render's free tier trades financial risk for a 30–50s cold
start; Netlify's cap is clean but the redeploy-cadence fix alone may not
address Sentinel's actual CPU-cost driver, which the Bucket 1/Bucket 2
tension above reframes as possibly the more fundamental lever anyway.

Current iteration of Sentinel — a Function that runs real, CPU-heavy
linting in-process on every org-wide PR, redeploying on a cadence
decoupled from its own actual code changes — isn't scalable as-is, and
none of the researched alternatives are a clean swap without a
significant downside of their own. Paused until a better option
surfaces, rather than picking the least-bad one under time pressure.
Tracked in issue #945 (board status: Someday). Revisit by weighing
Candidates A/B/C above _together with_ the Bucket 1/2 dispatch-everything
question — they may turn out to be the same decision, not two separate
ones. Record whatever's eventually decided as a new ADR, superseding or
extending ADR-0011 as appropriate.
