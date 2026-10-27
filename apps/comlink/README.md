# `@theholocron/comlink`

Holocron's alert relay: one Cloudflare Worker that takes webhooks from services whose alerts Discord cannot read, checks
who sent them and posts them to a channel as Discord messages.

> A comlink carries a message from one hand to another. Sentinel watches the repositories; Comlink carries the alerts.

It exists because Sentry's free plan has no Discord integration and what an internal integration sends is Sentry's own JSON.
Other services that post a webhook in their own shape can use the same Worker.

## How it works

One route per source: `https://comlink.theholocron.dev/<source>`.

1. The path picks the **source** (`/sentry`). An unknown path is a 404.
2. The source **verifies** the request, with the secret bound for it, before anything in the body is trusted (401 if not).
3. The source **formats** the delivery as a Discord embed with pings disabled, or says it does not carry it (202: it is
   acknowledged and dropped so the service does not retry).
4. The message is posted to the source's own **webhook** (502 if Discord refuses, 500 if none is bound).

Each source has two secret bindings, never echoed: `COMLINK_<SOURCE>_SECRET` and `COMLINK_<SOURCE>_WEBHOOK` (a dedicated
Discord webhook for the channel it feeds).

| Source   | Path      | Verified by                                                                  | Carries                      |
| -------- | --------- | ---------------------------------------------------------------------------- | ---------------------------- |
| `sentry` | `/sentry` | `Sentry-Hook-Signature`: hex HMAC-SHA256 of the body under the client secret | issue alerts (`event_alert`) |

## Adding a source

A source is one file under `src/sources/<id>/` that implements `Source` (`verify` and `format`) and one entry in the list
in `src/worker.ts`. Nothing else changes.

## Build

`pnpm --filter @theholocron/comlink delivery.build` writes `dist/worker.js`: a single ES module with no imports, which is
what `Workers.deployScript` uploads as it stands.

Not built yet: deploying it. That is `holocron notifications setup`'s job, through the `workers` capability, with the
secrets above.
