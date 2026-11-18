# The Holocron

Bruno's view of the requests that exercise the Holocron apps.

Open this folder (`.bruno`) with **Open Workspace**.

## What is here

| Collection           | App      | Sends                                                                                     | Environments                                            |
| -------------------- | -------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Sentinel webhook** | Sentinel | GitHub webhook deliveries to `POST /api/webhook`, signed with the App's webhook secret    | `Sentinel (local)`, `Sentinel (dev)`, `Sentinel (prod)` |
| **Comlink relay**    | Comlink  | Sentry `event_alert` deliveries to the relay Worker, signed with the integration's secret | `Comlink (local)`                                       |

Both collections run from harmless to acting. Only the last folder of each does real work:

- **Sentinel webhook:** `Rejected` (a GET, no signature, a wrong signature: 405, 401, 401), `Signed, no effect` (ping, a push to a non-default branch, `installation` created: answered with no GitHub call) and `Signed, acts on GitHub` (a `pull_request` opened for the `repo` and `pullNumber` in the environment, which runs every check and posts the results).
- **Comlink relay:** `Rejected` (a GET, an unknown source, no signature, a wrong signature: 405, 404, 401, 401), `Signed, nothing posted` (a resource the source does not carry, an `event_alert` with no event: 202, 422) and `Signed, posts to Discord` (an `event_alert`: posts an embed to the webhook the Worker is bound to).

A pre-request script signs each body as it is sent (`X-Hub-Signature-256` for Sentinel, `Sentry-Hook-Signature` for Comlink).

## Setup

1. Pick an environment. Use local or dev for anything that acts, and a sandbox repository (`theholocron/sandbox`, already in the environment). `Sentinel (prod)` is for the first two folders only.
2. Open Bruno with `pnpm exec holocron open requests` (`--environment prod` for the prod layer; quit Bruno first, it must not be running). The secrets `webhookSecret` (Sentinel) and `sentrySecret` (Comlink) are read from the 1Password Environment `theholocron/holocron - dev` (`SENTINEL_WEBHOOK_SECRET`, `COMLINK_SENTRY_SECRET`) into a private file that lasts until Bruno quits; nothing is pasted or stored in Bruno. The request files keep them blank, so the same files work in Postman.
3. Run the app: `pnpm --filter @theholocron/sentinel dev` for Sentinel (port 3000, plus the dev tunnel). Comlink runs on `wrangler dev`, port 8787.

## Without a Discord channel

The **Comlink** mock server (`mocks/comlink.yml`, listed under Mock Servers in Bruno) stands in for Discord on `http://localhost:4000`: `POST /discord/accepts` answers 204, `POST /discord/refuses` answers 500. Start it, run the Worker with `COMLINK_SENTRY_WEBHOOK=http://localhost:4000/discord/accepts`, and send `Signed, posts to Discord`. The mock's request log shows the embed, and nothing reaches a channel. The mock is a plain file in `mocks/`, not generated from the request files, so the sync never touches it.

## How the files stay in sync

The request files in each app are the source:

- Sentinel: `apps/sentinel/api/webhook.collection.json` and `webhook.environment*.json`, beside `webhook.mjs`.
- Comlink: `apps/comlink/src/worker.collection.json` and `worker.environment.json`, beside `worker.ts`.

Everything in `collections/` and `workspace.yml` is generated from them, with Bruno's own file writer. You can edit in Bruno or in the JSON; either way, run:

```sh
pnpm exec holocron sync requests
```

- Only the JSON changed: the Bruno files are regenerated.
- Only Bruno changed: the JSON is regenerated.
- Both changed since the last sync: a conflict. Nothing is written. Settle it with `--prefer source` (keep the JSON) or `--prefer workspace` (keep Bruno).
- `--check` writes nothing and exits 1 when anything is out of date; `--dry-run` shows what would change.

`.bruno/.sync.json` records what each side looked like at the last sync. Commit it with the rest. A setting only Bruno has (a request timeout, say) stays in Bruno and is reported, not pushed to the JSON. The `mocks/` folder is yours: the sync never reads or changes it.
