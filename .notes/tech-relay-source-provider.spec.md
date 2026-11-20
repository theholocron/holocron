---
id: SPEC-0107
status: draft
issue: theholocron/holocron#2519
blocked-by: []
related:
  - theholocron/holocron#1666
  - theholocron/holocron#2465
discussion:
  url: https://discord.com/channels/1303969001822486568/1573449239227273346
---

# A relay source can name its own provider

## Problem

`setup notifications` makes a relay source's webhook through the provider of the source's `capability`
(`loader.get(spec.capability)`), and the loader holds only the providers the root `holocron.config.ts` declares
(`relay.sources`, spec `tech-relay-sources`). A capability such as `deployment` or `vault` is **single**: one provider
per config.

This repo's root `deployment` is Cloudflare. Sentinel, the one Vercel project, names Vercel only in its own
`apps/sentinel/holocron.config.ts`. So the Vercel source (`COMLINK_VERCEL_*`, #2470) is built, tested and unusable
here: declaring `{ capability: "deployment" }` makes Cloudflare try to make a Vercel webhook, and the root cannot name
both. Sentinel's failed deployments are frequent and nobody sees one until they open Vercel.

## Decision

A relay source may name its provider:

```ts
relay: {
  host: `comlink.${domain}`,
  sources: {
    vercel: { capability: "deployment", provider: "vercel", events: ["deployment.error"], scope: ["sentinel"] },
  },
},
```

- **No `provider`** behaves as today: the configured provider of the capability.
- **`provider` equal to the configured one** is the same provider, no second load.
- **Any other `provider`** is loaded by name beside the configured ones, with the options of the workspace package that
  names it. That is how `doctor tokens` and `probe` already load a plugin only an app names
  (`workspaceProviders()`, `PluginLoaderOptions.extraProviders`, kyber's `loadProvider()` with no capability slot): the
  registry, the cardinality rules and what the root deploys, syncs or checks are untouched.

One function, `resolveRelaySourceProvider()`, makes the choice, and both `setup notifications` and `doctor notifications`
use it, so the doctor checks the webhook that setup made.

## Layout

`NotificationsRelaySource.provider?: string`: the plugin's name, the word `providers.<capability>` takes (`vercel`).
`relaySourcesProblem()` checks its shape and stays pure, so Sentinel's remote config check, which evaluates the layout
with no plugin loaded, still works. The plugin must implement the optional `ensureRelaySource` /
`inspectRelaySource` of `RelaySourceMethods`; whether it does is known only when it is loaded, so that is a refusal at
`setup`, naming the plugin, not a layout error.

## Setup and doctor

- `setup notifications` loads the named plugin when a source asks for one. `--dry-run` loads it and asks it nothing.
- A plugin that does not resolve, lacks the method or has no token is a refusal that says which and how to fix it. The
  run does not make a half-set-up relay: the check runs before anything is written.
- `doctor notifications` resolves the source the same way and keeps its rows (`relay-source:<id>`, `relay-answers:<id>`,
  `relay-feed-webhook:<id>`, `relay-bindings`). A plugin it cannot load or read is a skipped row with the reason, never a
  failure, so a machine without the token does not fail the run.
- The secret handoff is unchanged: a secret returned by the provider goes to the Worker in the same deploy as
  `COMLINK_<ID>_SECRET` and is never printed.

## The token

A second provider means a second token in the environment that runs `setup`. Vercel's is `HOLOCRON_VERCEL_TOKEN`
(declared for `local`, `dev` and `ci`); making a webhook needs it to manage the team's webhooks. `ci` stays without that
permission, so a leak from CI cannot add a webhook. The permission goes in the `tokens.mdx` table, the plugin's
`expect` and the probe together (the token-permission rule), and Vercel does not report a token's scope, so the probe
says what it cannot prove.

## What we are not doing

- **Running `setup notifications` per package.** The relay Worker, its DNS and its channel webhooks are one thing owned by
  the root layout; a package-level run would split one deploy and one secret handoff.
- **Making `deployment` a many capability.** Everything that reads `deployment` (deploy, previews, `doctor workers`)
  would have to pick one; a relay source wants only a webhook.
- **Keeping the webhook by hand.** A dashboard step is what #2465 exists to remove.
- **Doppler and Clerk.** Doppler is no longer used here (Sentinel and Comlink moved to 1Password, #1671) and Clerk is
  not used; both stay available for another repo through the capability's configured provider.

## Plan

Epic #2519, one pull request each, in this order:

1. #2520 check the Vercel plan and decide which failures to relay (the gate).
2. #2521 `provider` in the layout: type, validation, docs.
3. #2522 setup resolves a source's provider by name.
4. #2523 the doctor resolves it the same way.
5. #2524 the Vercel token's webhook permission: table, layers, probe (can go beside 2 to 4).
6. #2525 this repo declares `relay.sources.vercel` and feeds a channel.

## Unverified

- **The plan.** Vercel's `POST /v1/webhooks` needs a Pro or Enterprise team; Sentinel's team plan is not known. #2520
  settles it, and the epic stops there if it cannot make webhooks.
- **What "failure" means.** A deployment webhook carries build and deployment events (`deployment.error`,
  `deployment.canceled`), not a function that fails while running; that may already reach `#errors` through Sentry.
  #2520 decides which one is wanted and the channel (`#alerts` for errors, or `#deploys`).
- **`scope` by name.** The layout's `scope` is "in the vendor's terms": for Vercel a project id. Whether the provider
  also accepts a project name and resolves it, so the layout does not carry a `prj_` id, is open.
- **Options of the named plugin.** The first workspace package that names it supplies them (as for `doctor tokens`). If two
  packages disagree, the first wins; whether that needs an explicit `options` on the source is open.
