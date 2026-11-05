# `@theholocron/dagobah`

Runs a web-standard handler (`(Request, env) => Response`) locally, for a development instance behind a tunnel. It
loads the handler's secrets from a 1Password Environment, puts them in `process.env`, imports the handler, serves it
on the loopback address and says where its logs go.

Internal: private, not published. Sentinel's `scripts/serve.ts` is its first user.

> Dagobah is the swamp where Luke trains, away from the real thing. This is where a handler runs before it ships.

## Usage

```ts
import { serveHandler } from "@theholocron/dagobah";

await serveHandler({
  environment: "Sentinel - dev", // the 1Password Environment
  required: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "SENTINEL_WEBHOOK_SECRET"],
  logging: { tokenVar: "SENTINEL_AXIOM_INGEST_TOKEN", datasetVar: "AXIOM_DATASET" },
  port: Number(process.env.PORT ?? 3000),
  handler: async () => (await import("../src/handler/index.js")).handleWebhookRequest,
});
```

- `loadDevEnv({ environment, required })`: the process wins over the Environment; throws naming (never showing)
  what is missing. An unquoted multi-line value (a PEM key, which `op` prints that way) is read whole.
- `startDevServer({ handle, env, port })`: loopback only; one log line per request (method, path, status).
- `describeLogging(env, { tokenVar, datasetVar })`: one line, the dataset and never the token.
