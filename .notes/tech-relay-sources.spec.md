---
status: draft
issue: theholocron/holocron#2465
blocked-by: []
related:
  - theholocron/holocron#1666
---

# Relay sources: automating the vendor's side of a Comlink webhook

## Problem

Comlink (`apps/comlink`) carries a webhook from a service whose alerts Discord cannot read into a channel. Only Sentry's
side is automated: `Errors.ensureRelay` makes the integration and alert rule, `setup notifications` hands the signing
secret to the Worker as `COMLINK_SENTRY_SECRET` in the same deploy, and `doctor notifications` checks it. The four
sources queued in #1666 (Vercel #2461, Cloudflare #2462, Doppler #2463, Clerk #2464) each ask a person to open the
vendor's dashboard, make a webhook, copy a secret and run `sync secrets`. That is the manual work the CLI exists to
remove, and each pull request would have to invent its own layout keys and checks.

## Decision

Add one provider-neutral shape and one generic orchestration, and let each vendor plugin implement only its own API
calls. Sentry's secret and webhook flow through the same deploy; its integration and rule stay `Errors.ensureRelay`,
because that result is two objects, not one webhook.

### Layout

```ts
relay: {
  host: "comlink.theholocron.dev",
  sources: {
    vercel: { capability: "deployment", events: ["deployment.error"], scope: ["prj_abc"] },
  },
},
categories: [{ name: "ALERTS", channels: [{ name: "deploys", feeds: { relay: { vercel: true } } }] }],
```

- `relay.sources` is keyed by id: the path the relay serves it at and the name of its bindings
  (`COMLINK_<ID>_SECRET`, `COMLINK_<ID>_WEBHOOK`). Lower-case letters and digits, so the binding name is valid.
- `capability` is the capability whose provider makes the webhook: `deployment`, `dns`, `vault`, `auth` or `workers`
  (`RelaySourceCapability`). The vendor is whichever plugin the repo already configured for it, so no new capability is
  added and the org's `holocron_capabilities` property is untouched.
- `name`, `events`, `scope` and `options` are handed to the provider as written, in the vendor's own terms (Vercel's
  event names and project ids, Cloudflare's alert types, Doppler's config slugs). The CLI judges only their shape.
- `feeds.relay.<id>` on a channel is the same kind of feed as `feeds.errors`: a dedicated Discord webhook (default name
  the id capitalised, `avatar` as for the other feeds) whose URL goes to the Worker and nowhere else. One source feeds
  one channel; a forum takes no relay feed.

### Capability methods

Optional, on the capability the vendor already implements (`Deployment`, `Dns`, `Vault`, `Auth`, `Workers` extend
`RelaySourceMethods`), like `Errors.ensureRelay`:

```ts
ensureRelaySource?(input: { source; url; name; events?; scope?; options?; secret? }):
  Promise<{ created: boolean; updated: string[]; secret?: string; todo?: string[] }>;
inspectRelaySource?(input: { source; url; name; events?; scope?; options? }):
  Promise<{ exists: boolean; enabled?: boolean; events?: string[]; scope?: string[]; hasSecret?: boolean }>;
```

- `url` is `https://<relay.host>/<id>`. The webhook is **found again by that URL**, so a second run changes nothing.
  Nothing is ever deleted. A field the layout leaves out is left alone.
- `secret` in the input is a fresh 64-character hex secret, offered for a vendor that lets the caller choose it. The
  provider uses it only when it makes the webhook; an existing webhook keeps its secret.
- `secret` in the result is returned only when the secret was made or set now. An adopted webhook returns none and the
  Worker keeps the secret it has (a deploy sets only the bindings it is given). A new webhook that returns none is
  reported with a warning.
- `todo` is each step the vendor's API cannot do, one sentence each. Any `todo` fails the run, as for the other
  providers, and the Worker is still deployed with what is ready.
- Neither secret is ever printed, logged or reported; `inspectRelaySource` never reads one (`hasSecret` is a boolean
  where the vendor offers it).

### Orchestration (generic, in `cli/cli`)

- `setup notifications`: after the channels, `ensureRelaySource()` (`commands/relay-sources/`) runs for each source,
  each in its own `attempt`; then the Worker is deployed once with every source's `COMLINK_<ID>_WEBHOOK` and, where a
  secret came back, `COMLINK_<ID>_SECRET` (`deployRelay({ sources })`). Sentry is one entry in that list. `--dry-run`
  previews and calls no provider.
- Preflight (`relaySourcesProblem()`): `relay.host` set, ids valid, capability known, every `feeds.relay` entry names a
  declared source, every declared source is carried by exactly one channel, no two webhooks of one channel share a
  name. The `errors` provider is required only when a channel has `feeds.errors`; the provider of each declared
  `capability` is required.
- `doctor notifications`: `relay-answers:<id>`, `relay-feed-webhook:<id>` (the tracker's rows keep their ids),
  `relay-bindings` over every source, and `relay-source:<id>` from `inspectRelaySource` (exists, on, holds every
  declared event and scope, has a secret). A missing provider, token or `inspectRelaySource` is a skip.

### Not in this spec

Rotation of a signing secret, deleting a webhook, and moving `Errors.ensureRelay` onto the generic pair. A secret that
is lost (the webhook was made, then the Worker deploy failed) cannot be read back from Vercel, Cloudflare or Doppler;
today the fix is to delete the vendor's webhook and run `setup` again, as for a Discord webhook whose URL is lost.
A `setup --rotate` is a follow-up.

## What each vendor can do

Read from each vendor's API reference on 2026-11-19; nothing was called against a live account.

| Vendor     | (a) Create the webhook for `https://<host>/<id>`                                                                                                                                                                      | (b) Secret                                                                                                                           | (c) Find again by URL                                                                                                                                         | (d) Token                                                                                                                                                                                                                            | Automatable                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Vercel     | `POST /v1/webhooks?teamId=` with `url`, `events[]`, optional `projectIds[]`. Account webhooks need a Pro or Enterprise team (max 20)                                                                                  | Vercel makes it and returns `secret` in the create response only. The dashboard says it is never shown again                         | `GET /v1/webhooks` lists `id`, `url`, `events`, `projectIds` (no secret)                                                                                      | A Vercel API token (bearer) for the team. Vercel tokens have no per-endpoint scopes, so none can be named                                                                                                                            | Yes. The secret is create-only               |
| Cloudflare | `POST /accounts/{id}/alerting/v3/destinations/webhooks` with `name`, `url`, `secret`, **plus** a policy: `POST .../alerting/v3/policies` with `alert_type`, `mechanisms.webhooks[{id}]`, `enabled`, `name`, `filters` | The caller chooses it; Cloudflare sends it as is in the `cf-webhook-auth` header (no HMAC). Never returned by any read               | `GET .../destinations/webhooks` lists `id`, `name`, `url`, `type`, `last_success`, `last_failure` (no secret). The policy is found by name                    | API token with **Notifications Write** (or Account Settings Write) to create; **Notifications Read** (or Account Settings Read/Write) to read                                                                                        | Yes. Secret is caller-chosen and create-only |
| Doppler    | `POST /v3/webhooks?project=` with `url` (https), `name`, `secret`, `enableConfigs[]`, optional `authentication`, `payload`                                                                                            | The caller chooses it (`secret`), used for `X-Doppler-Signature: sha256=<hex HMAC-SHA256>`. Not returned; `hasSecret` is on the list | `GET /v3/webhooks?project=` lists `id` (slug), `name`, `url`, `enabled`, `hasSecret`, `enabledConfigs`, `canManage`. Update, enable, disable and delete exist | OAuth2 per the reference page, with no flow or scope stated. A webhook is per project; `canManage` says whether the caller may change it. Which Doppler token type (personal, service account) can manage webhooks is not documented | Yes. Secret is caller-chosen and create-only |
| Clerk      | **No.** The Backend API's only webhook routes are `POST` and `DELETE /webhooks/svix` (create or delete the instance's Svix app) and `POST /webhooks/svix_url` (a temporary link to Svix's dashboard)                  | Shown on the endpoint's page in the Clerk dashboard (`whsec_...`); no API returns it                                                 | No endpoint list in the Backend API                                                                                                                           | Secret key (`CLERK_SECRET_KEY`) for the three routes above; none makes an endpoint                                                                                                                                                   | **No**                                       |

Findings that bear on each follow-up:

- **Vercel.** The create response is the only time the secret is available, so a failed Worker deploy after creation
  loses it. The list response carries no `secret`; `GET /v1/webhooks/{id}` exists but was not read. No update call was
  found in the reference, so a webhook whose `events` or `projectIds` differ is reported by `doctor` and fixed by a
  person deleting it (setup never deletes). Signature: `x-vercel-signature`, hex HMAC-SHA1 of the raw body. Unverified:
  whether the single token `HOLOCRON_VERCEL_TOKEN` already holds is enough (it is a team-scoped token; Vercel reports no
  scope for it, so the `vercel token` probe cannot prove it).
- **Cloudflare.** A destination alone sends nothing: a notification policy must name it (`mechanisms.webhooks`) and an
  `alert_type`, so `events` is the list of alert types (`GET .../alerting/v3/available_alerts` says which an account may
  create) and the policy is the second object `ensureRelaySource` makes and finds by name. Webhooks are available on all
  plans (100 destinations without a paid zone). The token permission is new to the plugin: **when it is added, update the
  three places together** (`docs/src/content/docs/tokens.mdx`, the Environment layer that holds the token, and the
  `cloudflare token` probe), per `AGENTS.md`. Unverified: the exact list-policies path and response shape.
- **Doppler.** Everything but the token type is documented. `hasSecret` lets `inspectRelaySource` report a webhook made
  without a secret. The reference page's response schema is empty (`{}`), so what the create call returns, including
  the webhook's slug, was not seen; the list call finds it by URL. The `X-Doppler-Signature` example in the docs hashes
  `JSON.stringify(req.body)`, so the verifier must hash the raw body Comlink receives and say so in its test. Doppler is
  a `vault` provider in this repo, whose token may not be allowed to manage webhooks: check before relying on it.
- **Clerk.** It **cannot be fully automated** with a documented API. Checked three ways: the Backend API spec
  (`clerk/openapi-specs`, `bapi/2026-08-20.yml`) has only the three Svix routes above; the Platform API spec
  (`platform/beta.yml`) has no webhook route; and `npx clerk@latest api ls webhook` lists exactly those three. Clerk's
  own guide tells you to read the signing secret off the endpoint in the dashboard. Clerk delivers through Svix, and
  Svix's own API creates endpoints and returns `whsec_` secrets, but that API takes a Svix API key, which Clerk does not
  give an application; the only Svix credential Clerk hands out is the temporary dashboard link from `svix_url`, and
  Svix does not say whether an app-portal token may create endpoints or read secrets, so it was not tried and is not a
  basis for automation. The follow-up should be honest about it: `ensureRelaySource` for Clerk calls `POST
/webhooks/svix` only if the app is missing (idempotent, optional) and returns a `todo` naming the URL to add in
  the dashboard and the secret to copy into the `prod` Environment (`COMLINK_CLERK_SECRET`, pushed by `sync secrets
--env prod --cwd apps/comlink --worker comlink`), so the run fails until a person does it. `inspectRelaySource` has
  nothing to read and is left out, so `doctor` skips that row; the Worker's `relay-bindings` row still proves the
  secret is bound.

## Plan

1. This change: the layout keys, the two optional methods, the generic orchestration and checks, Sentry's secret and
   webhook through the shared deploy, tests and docs. No vendor method.
2. One pull request per vendor, in this order of certainty: Doppler, Cloudflare, Vercel, then Clerk (the `todo` form).
   Each adds the Comlink source file, its `ensureRelaySource`/`inspectRelaySource` over the vendor's client in
   `clients/`, the declaration in `.holocron/notifications.ts`, and its token permission in the three places.

## Unverified

Nothing here was run against a vendor. Open: Vercel's update call and whether `GET /v1/webhooks/{id}` returns the
secret; Cloudflare's list-policies call; Doppler's create response and which token types may manage webhooks; whether
Svix's app-portal token can create an endpoint for Clerk.
