# ADR-0011 — Sentinel's deploy target: Vercel Functions over Cloudflare Workers

## Status

Accepted

## Context

Sentinel (#679, epic #672) is a webhook receiver: GitHub delivers an event,
Sentinel has to respond inside GitHub's ~10s webhook timeout. That response
includes `validateConfig()` — fetching a repo's `holocron.config.*` over the
GitHub API and **executing it as a real module**, not just parsing it, so a
config doing `import { defineConfig } from "@theholocron/cli"` (the CLI's
own documented pattern, D8 in the epic spec: Sentinel must run the exact
same resolution path a developer or CI job uses, never a bespoke
server-side-only implementation) resolves and runs correctly. It does this
by writing the fetched content to a temp file and dynamically `import()`-ing
that path — `@theholocron/datapad`'s `loadFile` internals, unchanged, not a
bespoke parser.

Two serverless targets were considered up front: Cloudflare Workers and
Vercel Functions. Both need a `holocron` capability extension either way —
`Deployment` (Vercel) currently models a framework-aware project, not
"deploy one serverless function"; `Workers` (Cloudflare) was scoped to
reverse-proxying the wiki, not general script deployment. A new vendor
(Lambda, Fly.io, Deno Deploy, …) or self-hosting were both rejected: no
existing plugin for any of them, and nothing else in this org runs
self-hosted — both add operational surface a capability extension doesn't
need.

**Cloudflare Workers was chosen first**, for cold-start fit against the
~10s window — Workers' near-zero cold start versus Vercel's real-but-tolerable
one. That evaluation weighed cold start and which crypto API to use
(Web Crypto only, so the GitHub App JWT-signing code — clients #343 — would
run unchanged on either target). It did not weigh whether `validateConfig()`'s
_execution model_ works on the target at all — a real gap, not visible until
`packages/sentinel/src/handler.ts` actually got built against it.

Built out for Workers before the gap surfaced: Cloudflare Workers
secret-binding support (`clients` repo, #342), GitHub App authentication
(`clients` repo, #343), and a `Workers.deployScript()` capability extension
(`packages/cli` + `holocron-plugin-cloudflare`, #729) for deploying an
arbitrary script, not just the existing wiki reverse-proxy.

### The blocker

Cloudflare Workers run in V8 isolates: no filesystem — not even an
ephemeral one — and no dynamic `import()` of freshly-written content;
module graphs are static, resolved at deploy time. The `nodejs_compat`
compatibility flag polyfills API _shapes_ (`Buffer`, `process`, parts of
`node:crypto`) but never provides a virtual disk. `validateConfig()`'s
temp-file-write-then-`import()` strategy is structurally incompatible with
that model — `nodejs_compat` or not, no config flag fixes it.

## Decision Drivers

- D8 (epic #672): Sentinel must run the same `holocron run`/`holocron ci`
  resolution path a developer or CI job uses — ruling out a parser
  reimplementation as the fix for the Workers gap.
- Cold-start fit against GitHub's webhook timeout — the original driver,
  still satisfied by Vercel's Node.js runtime.
- Minimize new operational surface — no new vendor, no self-hosting.

## Decision Outcome

**Vercel Functions**, reversed from the original Cloudflare Workers choice.
Vercel Functions run on a real Node.js runtime with a genuinely writable
`/tmp` and full dynamic `import()` — `validateConfig()` runs there
completely unchanged, no redesign needed.

`handler.ts` (`handleWebhookRequest(request, env)`, #730) itself needed
**zero** changes across the reversal: it was already a plain,
deploy-target-agnostic `(Request, Env) => Response` function, never a
Cloudflare-specific `{ fetch }` module-worker export — the platform
adapter was always meant to be a thin layer on top, not baked into the
handler.

### Positive Consequences

- `validateConfig()` needed no redesign — the org's D8 constraint (run the
  real resolution path, real dynamic imports and all) stays intact without
  a Workers-specific workaround.
- The reversal cost was isolated to the deploy-target decision itself, not
  the webhook-handling logic.

### Negative Consequences

- The Cloudflare Workers secret-binding support (#342) and
  `Workers.deployScript()` (#729) aren't what Sentinel deploys through.
  Not wasted — general `holocron-plugin-cloudflare` capability surface,
  already used by the wiki reverse-proxy, available for future Workers
  use — but it was built against an assumption that didn't hold for this
  consumer.
- `Deployment` (Vercel) needs the same shape of capability extension
  `Workers.deployScript()` just did — not yet started, tracked as its own
  PR-stack item on #679.

## Pros and Cons of the Options

### Cloudflare Workers

- Good, because near-zero cold start is the best fit for a hard ~10s
  webhook timeout.
- Bad, because the V8-isolate model has no filesystem and no dynamic
  `import()` of freshly-written content — incompatible with
  `validateConfig()`'s execution strategy, `nodejs_compat` or not.

### Vercel Functions

- Good, because a real Node.js runtime runs `validateConfig()` completely
  unchanged.
- Bad, because cold start is real, if tolerable, versus Workers' near-zero
  — acceptable against a ~10s budget, not free.

## References

- Issue: #679 (Sentinel v1), epic #672 (Holocron Platform)
- Spec: `.notes/tech-sentinel-v1.spec.md` — "Resolved — deploy target"
  section carries the same account in narrative form, kept in sync with
  this ADR
- PRs: #342 (Cloudflare Workers secrets), #343 (GitHub App auth), #729
  (`Workers.deployScript()`), #730 (`handleWebhookRequest` + the reversal)
