---
status: draft
issue: theholocron/holocron#940
blocked-by: []
related:
  - theholocron/holocron#679
---

# Sentinel's deploy target: Netlify Functions over Vercel Functions

Builds on [ADR-0011](../docs/wiki/decisions/0011-sentinel-deploy-target-vercel-over-cloudflare-workers.md)
("Sentinel's deploy target: Vercel Functions over Cloudflare Workers"),
which is `accepted` and unchanged by this spec in its reasoning — only its
conclusion is being re-opened, for a cost reason ADR-0011 never had to
weigh.

## Context

Sentinel's Vercel team (`iamnewton`, `team_YrFqXg1QceAu0CdYdBmrDpop` — the
exact `teamId` in `packages/sentinel/holocron.config.ts`'s
`providers.deployment`) hit 75% of the Hobby plan's included Fluid Active
CPU (4 hours/month). The driver: Sentinel's webhook handler runs real,
in-process linting — `ESLint.Linter.verify()`
(`packages/sentinel/src/actions/static-analysis/lint-static-analysis.ts`),
plus markdown-lint, formatting, actionlint, DCO, and the other check
actions — on every PR/push across every repo in the org. That's genuine
CPU-bound work (unlike a pure I/O-bound webhook relay), and it scales with
org-wide PR volume.

Vercel Pro's Spend Management (confirmed available on Pro, not
Enterprise-only, contrary to an earlier assumption — see
`docs/spend-management`) can hard-cap spend with a "pause production
deployments" action, checked every few minutes. That removes the
unbounded-bill risk, but Pro carries a non-zero base seat cost regardless
of usage — it doesn't get us back to free, which is the actual goal here.

## Goal

Move Sentinel's deploy target to a service with a free allotment large enough
that an org-wide webhook receiver doesn't realistically approach it, while
preserving every constraint ADR-0011 already established — most load-bearing: a real
Node.js runtime, not a V8 isolate.

## Why the runtime model is the hard constraint, not the pricing

ADR-0011 already fought this exact battle once, with Cloudflare Workers:

> Cloudflare Workers run in V8 isolates: no filesystem — not even an
> ephemeral one — and no dynamic `import()` of freshly-written content;
> module graphs are static, resolved at deploy time. The `nodejs_compat`
> compatibility flag polyfills API shapes but never provides a virtual
> disk.

`validateConfig()` fetches a repo's `holocron.config.*` over the GitHub API,
writes it to a temp file, and dynamically `import()`s that path —
`@theholocron/datapad`'s real `loadFile` resolution, unchanged, per epic
#672's D8 constraint (Sentinel must run the same resolution path a
developer or CI job uses, never a bespoke server-side parser). That
requires a writable filesystem and real dynamic `import()` of
freshly-written content. Any V8-isolate runtime fails this the same way
Workers did — which rules out **Netlify Edge Functions** and Deno Deploy
for the same reason, not only Cloudflare Workers.

**Netlify's standard Functions** (as opposed to Edge Functions) run on a
real Node.js/Lambda runtime, the same category Vercel Functions is in.
That's _why_ it's the leading candidate — not the pricing alone — but it is
an assumption to verify, not a known fact, until the spike below confirms
it. ADR-0011's own "Negative Consequences" section records exactly this
mistake happening once already: Cloudflare-specific plugin surface
(`Workers.deployScript()`, #729) got built before the filesystem gap
surfaced in `handler.ts`. This spec's implementation order exists
specifically to not repeat that.

## Candidates considered

### Netlify Functions (recommended, pending the spike)

- Standard Functions run on AWS Lambda under the hood — real Node.js
  runtime, writable `/tmp`, real dynamic `import()`. Should satisfy
  `validateConfig()` unchanged, same as Vercel did.
- Free tier: 125,000 invocations/month, 100 hours of function runtime/month
  — roughly 25x Vercel Hobby's 4 Active-CPU-hour meter (not an
  apples-to-apples comparison: Netlify's 100 hours is wall-clock runtime,
  Vercel's 4 hours is CPU-active-only time that pauses during I/O — but the
  margin is large enough that the distinction doesn't change the
  conclusion for Sentinel's actual traffic).
- No payment method required on the free tier — exceeding it is a hard
  stop, not a metered bill, the same shape Vercel Hobby already has. This
  is the property that actually matters for "free is preferable, no
  runaway spend."
- Migration cost: moderate. New plugin package, new stage-deploy script,
  two workflow edits, one DNS repoint, one webhook URL cutover. Detailed
  below.

### AWS Lambda directly (fallback)

- Largest free allotment by raw numbers: 1,000,000 requests +
  400,000 GB-seconds/month, perpetual (not a 12-month promo).
  At Sentinel's traffic, this is effectively unreachable.
- Real Node.js runtime (Lambda), same compatibility story as Netlify.
- No built-in "pause at budget" the way Vercel/Netlify have — would need a
  CloudWatch Billing Alarm + a manual action to actually stop spend, which
  is more to wire up than either Vercel or Netlify's dashboard toggle.
- No existing `holocron-plugin-aws` — more net-new plugin surface than
  Netlify, which at least shares deploy shape (file-based function
  deploy, env vars, custom domain) with Vercel's existing capability
  implementation to model from.
- Keep as the fallback if the Netlify spike fails for a reason specific to
  Netlify (not the Node-runtime assumption, which would also sink this
  option — Lambda is exactly where Netlify Functions already run).

### Not reconsidered

Cloudflare Workers, Netlify Edge Functions, Deno Deploy — all V8 isolates,
all fail the same `validateConfig()` constraint ADR-0011 already
established. Self-hosting — rejected in ADR-0011 for adding operational
surface nothing else in the org carries; still true here.

## Implementation order

### 0. Spike: verify the runtime assumption first — done, passed

Deployed a minimal Netlify Function (throwaway, not in this repo) that
runs the exact sequence `validateConfig()` depends on: find this
function's own `node_modules` by walking up from its deployed location,
`mkdtemp()` under `os.tmpdir()`, symlink `<tmpDir>/node_modules` to the
real one, write a `{"type":"module"}` marker, write a fresh `.ts` file,
register `tsx`'s ESM loader, dynamically `import()` that file. Confirmed
`ok: true` on three separate invocations (cold and warm) against a real
deployed function — runtime reported as `nodejs24.x`. **The assumption
holds**: Netlify's standard Functions satisfy ADR-0011's constraint.

Three real gotchas surfaced, none apparent from Netlify's docs, all fixed
in the spike and worth carrying into the actual plugin/stage-deploy work:

1. **`node_bundler = "none"` does not ship `node_modules`.** It only
   disables esbuild tracing/bundling of whatever `included_files` already
   names. Without `included_files = ["node_modules/**"]` too, the deployed
   function has zero `node_modules` — `findPackageRoot()` throws
   immediately (`no node_modules found above "/var/task"`). Both settings
   are required together; `included_files` paths are relative to the
   project root (or `base`), not the function file's own directory.
2. **Function size limit is 250MB, and it's possible to exceed it quickly by
   accident.** Shipping a real `@theholocron/cli` install's full
   dependency tree was 451MB — way over, and also unnecessary: the spike
   doesn't need to import that specific package, only _some_ real
   dependency resolved through the symlink, to prove the resolution path
   works. (A `tsx`-only install is ~11MB.) When the real migration stages
   Sentinel's actual trimmed/pinned `package.json` — already a small,
   deliberately-minimal dependency list, same discipline Vercel's
   `stage-deploy.mjs` already applies — this should be a non-issue, but
   it's worth a check against the 250MB ceiling as part of that
   work, not assumed away.
3. **Cross-platform native binaries: install for the deploy target, not
   your laptop.** A `node_modules` installed on macOS ARM64 and shipped
   as-is crashed with esbuild's own platform-mismatch error (`tsx` depends
   on esbuild, which ships per-platform native binaries as
   `optionalDependencies`). Netlify's Lambda runtime is linux-x64; fixed
   locally with `npm install --os=linux --cpu=x64 --libc=glibc`. The real
   stage-deploy script needs the equivalent of this — either run the
   install step on a linux-x64 CI runner (likely already true, since
   GitHub Actions' `ubuntu-latest` runners are linux-x64) or explicitly
   force the platform flags the way the spike did, the same way Vercel's
   own build step always installs on Vercel's own Linux build machines
   rather than shipping a locally-installed tree.

Also confirmed, incidentally: this Netlify team ("Holocron", slug
`iamnewton`) defaults new projects to **private** (Netlify's July 2026
policy change for newly-created teams) — a real production Sentinel site
needs **Project visibility → Public** set explicitly
(`/configuration/general/#project-visibility` in the site's dashboard,
dashboard-only, no CLI/API path found), or GitHub's webhook deliveries
would 401 against the same login-redirect wall the spike hit before that
was flipped. Worth doing as the very first step of the real site's setup,
before anything else, so it isn't a last-minute surprise during cutover.

### 1. `@theholocron/holocron-plugin-netlify`

Scaffold via the `/holocron-skill-plugin` skill. Implements the
`deployment` capability (`packages/cli/src/plugin/capabilities.ts:493`)
against Netlify's REST API. The interface is already provider-agnostic —
this is a new implementer, not new shape:

| `Deployment` method                                        | Netlify API equivalent                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deployFunction`                                           | Deploy API — zip/digest upload to a site                                                                                                                        |
| `getDeployment`                                            | Get Deploy                                                                                                                                                      |
| `listEnvVars` / `setEnvVar`                                | Site env var API (per deploy context — production/branch-deploy/deploy-preview map reasonably onto `DeploymentTarget`, needs confirming at implementation time) |
| `ensureCustomDomain`                                       | Custom domain API — verification record shape likely differs from Vercel's (open question below)                                                                |
| `listProjects` / `ensureProject` / `updateProjectSettings` | Sites API                                                                                                                                                       |

Same auth-resolver pattern every other plugin uses
(`createResolveToken`, `HOLOCRON_NETLIFY_TOKEN` / `NETLIFY_AUTH_TOKEN` /
keyring `netlify`) — no new auth mechanism.

### 2. Sentinel's stage script

`packages/sentinel/scripts/stage-deploy.mjs` currently builds
`.vercel-deploy/`: copies `api/webhook.mjs` + built `dist/index.mjs`,
copies `vercel.json` (whose `functions["api/webhook.mjs"].includeFiles:
"node_modules/**"` forces Vercel to skip `@vercel/nft`'s tracer — needed
because commitlint's `extends` chain resolves by string name at runtime,
which no static tracer can follow), and writes a trimmed `package.json`
with exact resolved versions (Vercel's install step doesn't understand
pnpm's `workspace:` / `catalog:` protocols).

A Netlify equivalent needs the same three properties, in Netlify's shape:
a `netlify.toml` (or `netlify/functions/`-relative config) with
`included_files` covering the same "ship the whole resolved
node_modules, don't let the bundler trace it" need, and the same
trimmed/pinned `package.json`. `bundle-externals.mjs`'s dependency-declared
check is deploy-target-agnostic and carries over unchanged.

### 3. `packages/sentinel/holocron.config.ts`

```diff
 providers: {
-	deployment: ["vercel", { teamId: "team_YrFqXg1QceAu0CdYdBmrDpop", domain: "sentinel.theholocron.dev" }],
+	deployment: ["netlify", { siteId: "<netlify-site-id>", domain: "sentinel.theholocron.dev" }],
 	dns: "cloudflare",
 	secrets: "github",
 	vault: ["doppler", { project: "sentinel", config: "prd" }],
 },
```

`dns`, `secrets`, `vault` are unaffected — secrets fan-out already goes
through `Deployment.setEnvVar()` generically (not a Vercel-specific
mechanism), so pointing `deployment` at Netlify is sufficient; no change
needed to how `holocron secrets sync` is invoked.

### 4. CI workflows

Both are hand-maintained (not astromech-templated — Sentinel owns its own
CI per the comments in each file):

- `.github/workflows/sentinel.deploy.yml` — swap the `VERCEL_TOKEN` env/secret
  for the Netlify equivalent. `pnpm run delivery.deploy` stays the actual
  invoked command, unchanged.
- `.github/workflows/sentinel.secretsSync.yml` — same token swap. The
  `holocron secrets sync` CLI invocation's flags (`--project-id`,
  `--target production`, `--github-secret ...`) are already generic;
  nothing provider-specific to change there.

**No change** to `@theholocron/astromech`'s `deploy-on-release.ts` —
confirmed zero Vercel-specific references; it already runs each
package's own `delivery.deploy` script, regardless of what that script
deploys to.

### 5. DNS and cutover

1. Create the Netlify site, attach `sentinel.theholocron.dev` as a custom
   domain, get back whatever verification record Netlify requires.
2. `Dns.upsertRecord()` (Cloudflare) adds that record — same flow
   `ensureCustomDomain()` already drives for Vercel today, only it's a
   different target.
3. Deploy to Netlify, verify with a synthetic webhook event (not a real
   GitHub App event yet) — confirm `validateConfig()`'s full path works
   end-to-end on real traffic shape, not only the spike's minimal repro.
4. Flip the GitHub App's webhook URL (external to this repo, a dashboard
   action) to the Netlify endpoint.
5. Leave the Vercel project live but idle for a rollback window; flipping
   the webhook URL back is the entire rollback — Sentinel is stateless, no
   data migration involved either direction.
6. Once confirmed stable, decommission the Vercel project and remove
   `holocron-plugin-vercel`'s usage from Sentinel's config (the plugin
   package itself stays — other repos may still use it for actual
   framework deploys, unlike Sentinel's files-only `deployFunction` path).

## Open questions

1. **Netlify's custom-domain verification record shape** — does its API
   return a DNS-challenge record the same way Vercel's does (consumed
   directly by `Dns.upsertRecord()`), or does Netlify's custom-domain flow
   not expose the same per-request verification handshake (the same gap
   `ensureCustomDomain`'s doc comment already notes for Cloudflare Pages)?
   Determines whether `ensureCustomDomain` returns a real record or `null`
   for Netlify — find out when building the plugin, not before.
2. **Deploy contexts vs. `DeploymentTarget`** — Netlify's
   production/branch-deploy/deploy-preview contexts need mapping onto
   `"production" | "staging"` (`DeploymentTrigger`). Sentinel only ever
   deploys to production, so this may not need to be exact — confirm
   `deployFunction`'s `target` plumbing doesn't require more than that one
   value to work correctly.
3. **Does the spike change the answer for other future Netlify-hosted
   Holocron services**, or is this narrowly about Sentinel's specific
   `validateConfig()` requirement? Worth noting in whatever ADR eventually
   records the decision, but not blocking this spec.

## What happens after the spike

If the spike confirms the runtime assumption and the migration lands, this
spec's conclusion should get recorded as a new ADR (not an edit to
ADR-0011, which stays accurate as a historical record of the
Vercel-over-Workers decision) — mirroring how ADR-0011 itself followed
`.notes/tech-sentinel-v1.spec.md`. If the spike fails, this spec moves to
`superseded` with the failure reason recorded, and the fallback (AWS
Lambda, or staying on Vercel Pro) gets its own follow-up issue.

## Correction — the billing comparison above was wrong (2026-10-06)

The "Free tier: 125,000 invocations/month, 100 hours of function
runtime/month" line under "Netlify Functions (recommended, pending the
spike)" above described an invocation/runtime-metered model. **That is
not how Netlify actually bills in 2026.** The real model, confirmed live
against this org's own Netlify account: a monthly **credit** allowance
(300 on the free plan), where a **production deploy costs 15 credits**
flat, regardless of function invocation count or runtime — and unlike
Vercel's Hobby tier, there is **no overage and no graceful degradation**:
hitting 0 credits pauses every site on the account until the next billing
month. Branch/preview deploys aren't metered; only a deploy that becomes
the live production deploy is.

That line item is the one that matters for Sentinel, because of
`@theholocron/astromech`'s `deploy-on-release.ts`: Sentinel's
`holocron.config.ts` declares `{ name: "delivery.deploy", with: { on:
"release", channel: "alpha" } }`, which redeploys on every `alpha`-channel
release that touches `packages/sentinel/**` or any of its three
`workspace:*` dependencies — `@theholocron/cli`, `@theholocron/astromech`,
`@theholocron/datapad`. Those three are among the most frequently-changed
packages in this repo. A check of the 15 most recent alpha releases
(2026-10-02 through 2026-10-06, 4 days): **14 of 15 touched one of those
paths** — meaning the real deploy-on-release pipeline would fire on
essentially every alpha release, not occasionally. At 15 credits each,
that's ~14 production deploys / 4 days ≈ **210 credits/4 days**, enough to
exhaust the entire 300-credit monthly allowance in under a week from
normal release cadence alone, before counting a single real webhook
invocation. (The 150/300 credits already spent on this org's Netlify
account as of this writing came from this spec's own spike/testing
deploys, not from Sentinel's real pipeline — Sentinel hasn't cut over
yet — but they demonstrate the same per-deploy cost rate.)

This isn't a Netlify-specific problem — it's the same root cause that
drove Sentinel off Vercel in the first place (frequent redeploys +
CPU-bound linting), metered on a different axis (deploy count instead
of CPU-active-time). Swapping providers without addressing the
redeploy cadence trades one metering cliff for a faster one. The
plugin (`@theholocron/holocron-plugin-netlify`) and client
(`@theholocron/netlify-client`) built under this spec are still correct,
general-purpose infrastructure — nothing above is wrong about _how_ to
deploy to Netlify, only about whether Netlify's free tier tolerates
Sentinel's _current_ deploy frequency. The actual cutover (this spec's
"Implementation order" steps 2–5) is parked, finished only as far as a
non-merged branch/PR, pending the broader question opened in
`tech-sentinel-deploy-architecture-reconsideration.spec.md` and tracked in
issue #945.
