<!-- alex disable invalid -->

# `@theholocron/comlink`

Holocron's alert relay: one Cloudflare Worker that takes webhooks from services whose alerts Discord cannot read, checks
who sent them and posts them to a channel as Discord messages.

> A comlink carries a message from one hand to another. Sentinel watches the repositories; Comlink carries the alerts.

It exists because Sentry's free plan has no Discord integration and what an internal integration sends is Sentry's own JSON.
Other services that post a webhook in their own shape can use the same Worker.

## How it works

One route per source: `https://comlink.theholocron.dev/<source>`.

1. The path picks the **source** (`/sentry`). An unknown path is a 404.
2. A body over 256 KB is refused (413) before it is hashed. The source **verifies** the request, with the secret bound
   for it, before anything in the body is trusted (401 if not).
3. The source **formats** the delivery as a Discord embed with pings disabled, or says it does not carry it (202: it is
   acknowledged and dropped so the service does not retry), or says it cannot read one it should carry (422).
4. The message is posted to the source's own **webhook** (502 if Discord refuses, fails or takes over 8 seconds, 500 if none is bound).

Each source has two secret bindings, never echoed: `COMLINK_<SOURCE>_SECRET` and `COMLINK_<SOURCE>_WEBHOOK` (a dedicated
Discord webhook for the channel it feeds).

| Source   | Path      | Verified by                                                                  | Carries                      |
| -------- | --------- | ---------------------------------------------------------------------------- | ---------------------------- |
| `sentry` | `/sentry` | `Sentry-Hook-Signature`: hex HMAC-SHA256 of the body under the client secret | issue alerts (`event_alert`) |

## Projects

The embed's Project field is the Sentry project's slug, taken from the event's API address (`data.event.url`, `.../api/0/projects/<org>/<project>/events/<id>/`) because the payload otherwise carries only a number. Which projects are relayed is the layout's `relay.errors.projects`; see the docs page for Comlink.

## Adding a source

A source is one file under `src/sources/<id>/` that implements `Source` (`verify` and `format`) and one entry in the list
in `src/worker.ts`. Nothing else changes.

## Build

`pnpm --filter @theholocron/comlink build` writes `dist/worker.js`: a single ES module with no imports, which is
what `Workers.deployScript` uploads as it stands.

Deploying it is `holocron setup notifications`'s job, through the `workers` capability, with the secrets above.

## Secrets

`apps/comlink/holocron.config.ts` keeps the signing secrets in the `prod` layer of the 1Password Environments (`<org>/<repo> - prod`, beside Sentinel's values; the `COMLINK_` prefix tells them apart), the same way Sentinel does, so there is one place to rotate them and nothing is pasted into a shell.

```bash
# once, by hand (`op` cannot create an Environment): make the Environment `<org>/<repo> - prod` (if it does not exist) and add
# COMLINK_SENTRY_SECRET (the Sentry integration's client secret) to it, then:
holocron sync secrets prod --cwd apps/comlink --worker comlink
```

Only the `COMLINK_` names of the Environment reach the Worker: `repo.secrets.deploy` in this config says so, and `--worker` with no entry stops with a `ConfigError` (#2061). Any other key stays in the Environment.

With `relay.errors` in the root `holocron.config.ts`, `holocron setup notifications` creates the Sentry integration and alert rule itself and deploys the Worker with the integration's client secret, so the Environment above is only needed to keep the secret somewhere else too (or for a source `setup` does not create).

`holocron probe comlink deliver` reads the signing secret from this config's vault (so from the `prod` layer Environment above, signed in with `op`), unless `COMLINK_SENTRY_SECRET` is set in the environment.

`COMLINK_<SOURCE>_WEBHOOK` is not kept in the Environment: `holocron setup notifications` makes each channel's webhook and sets its URL on the Worker directly. Run `setup` before `sync secrets`, since a secret can only be set on a Worker that exists.

The Environment holds only the signing secrets the Worker verifies with. Do not add `HOLOCRON_SENTRY_COMLINK_TOKEN` to it: that is a broad Sentry API token the CLI uses to set up the integration (see the tokens page), and it must never reach the Worker.
