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
billed by uptime/compute allocation rather than invocations or deploys
(e.g. Fly.io's free allowance, Render's free web service tier, a
Railway hobby plan). Decouples both meters Sentinel has hit so far.
Trade-offs to weigh: cold-start goes away but so does "only pay when
traffic arrives"; free-tier always-on compute allowances are usually
smaller/stricter than FaaS free tiers (sleep-on-idle policies, e.g.
Render's free web services spin down after 15 minutes idle and cold-start
on the next request — may reintroduce a version of the same problem);
revisits ADR-0011's self-hosting rejection, which this spec should either
confirm still applies or explicitly narrow (managed always-on platform
vs. literal self-hosted VPS are not the same operational burden).

### C. Fix the redeploy heuristic AND keep the provider question open

Not mutually exclusive with A or B — the path-based over-triggering in
`deploy-on-release.ts` is arguably a bug regardless of where Sentinel
ends up hosted (other current/future packages using `on: "release"`
have the same false-positive exposure, without a billing cliff to
surface it). Worth fixing on its own merits even if the hosting
question is settled separately.

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

## Next step

Decide between A/B/C (not mutually exclusive) once there's appetite to
revisit this — no urgency, since Sentinel hasn't actually left Vercel yet
and there is no immediate concern. Record the decision as a new ADR once made,
superseding or extending ADR-0011 as appropriate.
