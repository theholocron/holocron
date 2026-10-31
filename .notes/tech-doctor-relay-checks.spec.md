---
status: proposed
issue: theholocron/holocron#1458
blocked-by: []
related:
  - theholocron/holocron#1162
  - theholocron/holocron#1155
  - theholocron/holocron#1110
  - theholocron/holocron#1166
---

# Doctor: check the Checkly feed and the Comlink relay

## Problem

`holocron doctor notifications` compares the Discord server with the layout. Two feeds reach Discord from outside it, and neither is checked end to end:

- **Checkly** posts uptime alerts to #uptime through an alert channel (`Message to #uptime`) that points at a webhook named `Checkly`.
- **Comlink** carries Sentry errors to #errors: Sentry integration, then the Worker at `relay.host`, then a webhook named `Sentry`.

If any link drifts (a deleted webhook, an unsubscribed check, a Worker without its secrets, a disabled Sentry rule) nothing fails until an alert is lost. `notifications setup` builds all of it; nothing reads it back.

## Design

These are new steps of `doctor notifications`, not new subcommands. They follow the rules in `tech-doctor-deep-checks.spec.md` (read-only, one row per step, a missing token or provider is a skip with the reason) and use `doctor-checks/` (`CheckRow`, `declaredVsActual`) so no new renderer is written.

### Checkly feed (when a channel has `feeds.monitoring` and a `monitoring` provider is configured)

| Step          | Declared                                                                                    | Actual                                                                                |
| ------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| feed webhook  | webhook named `feeds.monitoring.webhook` (default `Checkly`) on the channel, with a picture | Discord inspect (already read by the webhook and avatar steps; reuse, do not re-read) |
| alert channel | a webhook alert channel named `Message to #uptime` that posts through the feed webhook      | `Monitoring.inspectAlertChannel(name)`, compared by webhook id                        |
| subscriptions | every check on the account is subscribed and activated                                      | same read: the checks it is not subscribed to, or has switched off                    |

### Comlink relay (when the layout has `relay` and a channel has `feeds.errors`)

| Step               | Declared                                                                                               | Actual                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Worker answers     | `https://<relay.host>/sentry`, unsigned `POST`, gets `401`                                             | a single `fetch`; `404` is reported as "not deployed or no route", a network error as a failure |
| Worker and route   | script `relay.script` (default `comlink`) with route `<host>/*`                                        | `Workers.inspectScript(name)`                                                                   |
| bindings           | `COMLINK_SENTRY_WEBHOOK` and `COMLINK_SENTRY_SECRET` bound                                             | same read; names only                                                                           |
| feed webhook       | webhook named `Sentry` on the `errors` channel                                                         | Discord inspect (reuse)                                                                         |
| Sentry integration | integration `relay.errors.integration` (default `Comlink`) with the right webhook URL and alert action | `Errors.inspectRelay(input)`                                                                    |
| Sentry rule        | rule `relay.errors.rule` exists and is enabled on every project in `relay.errors.projects`             | same read                                                                                       |

The DNS placeholder (`AAAA <host> 100::`, proxied) is already checked by `doctor dns`; this spec does not repeat it.

### New optional provider reads

Each is optional on its capability, like `Monitoring.listChecks`; a provider without it makes its steps a skip ("the provider cannot be read"), not a failure.

- `Monitoring.inspectAlertChannel?(name)`: `{ exists, discord?, webhookId?, unsubscribed[], deactivated[] }`. The Checkly plugin already lists and gets alert channels (`client.alertChannels`), so this is a read-only wrapper. The alert channel's URL is a credential and never leaves the plugin: `webhookId` is the id inside a Discord webhook URL (public, unlike the token after it). The doctor compares it with the id of the feed webhook, which the Discord plugin's `inspect` now returns in `webhookIds` (by lower-cased name, for any channel that has a webhook or a feed). `unsubscribed` and `deactivated` are check names, worked out in the plugin from the account's checks, so no check ids are compared here.
- `Workers.inspectScript?(name)`: `{ exists, routes[], bindingNames[] }`. Binding **names** only. Cloudflare returns secret names without values; the implementation must not request or keep values.
- `Errors.inspectRelay?(input)`: the read half of `ensureRelay`, returning `{ integration?: { webhookUrl, alertAction }, rules: { project, enabled }[] }`. The Sentry plugin already finds both by name inside `ensureRelay`; split the find from the write.

### The Worker request

An unsigned request is safe: the Worker rejects it before reading the body. Use a short timeout (5 s) and no retries. It is the only network call these steps make that is not to a provider API, so it goes through an injectable `fetch` for tests.

### Interaction with `doctor --all`

`--all` runs notifications as `--built-only` so it posts nothing. These steps also post nothing, so they run under `--built-only` too; the Worker request is a read. State this in the command docs. If a token is missing (`CLOUDFLARE`, `CHECKLY`, `SENTRY`), the affected rows skip.

## Tokens

Reads only. `tokens.mdx` already lists the Sentry token (org integrations and alerts write, from #1155); the check needs only the read side of it. Document any narrower read scope the spike finds for Sentry, Cloudflare Workers and Checkly. Do not widen any token for this work.

## Test plan

Stubs only; no real provider call and no real `fetch`. Cover per step: ok, drifted (one problem line), missing token (skip), provider without the read (skip). Cover the Worker request: `401` ok, `404`, `200` (unexpected, fail), timeout, network error. Assert no secret value appears in any row, log line or thrown message (use a sentinel value in the stub and search the output).

## Rollout

1. This spec, merged first.
2. Checkly feed steps and `Monitoring.inspectAlertChannel` (one PR).
3. Relay steps: Worker request, `Workers.inspectScript`, bindings (one PR).
4. Sentry integration and rule steps and `Errors.inspectRelay` (one PR). Tick the last box on #1155.
5. Docs: `doctor-notifications.mdx`, `tokens.mdx`; tick the boxes on #1162.
6. A live run of `doctor notifications` by the maintainer with real credentials. This is a manual acceptance step, not a CI one.

## Not in scope

Delivery proofs that post and read back (probes, #1166, closed). Changes to `notifications setup` or the Comlink Worker. The Discord checks already in `doctor notifications`.
