# `@theholocron/dagobah`

Runs a web-standard handler (`(Request, env) => Response`) locally, for a development instance behind a tunnel. It
loads the handler's secrets from a 1Password Environment, puts them in `process.env`, imports the handler, serves it
on the loopback address and says where its logs go. It also supervises two foreground processes (an application and
a tunnel connector) and runs GitHub's App manifest flow to create a GitHub App.

Published for any project with a web-standard handler to run locally. `holocron dev serve` is built on it, and Sentinel's `scripts/serve.ts` was its first user.

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
- `superviseProcesses({ primary, companion })`: runs two processes in the foreground, each with its own extra
  environment; stops one when the other ends; Ctrl-C and a termination signal go to both and are not a failure. Resolves
  `{ exitCode, endedFirst, interrupted }`; rejects naming a program that is missing or cannot start.
- The GitHub App manifest flow, for creating an App from a manifest file: `buildAppManifest({ base, name, webhookUrl,
redirectUrl })` checks the shared part and adds the per-instance part (the webhook must be `https`);
  `appManifestPage(action, manifest)` is the page that posts it to GitHub; `serveAppManifest({ state, page })` is a
  one-shot loopback server that takes the one-time code (only with its `state`, and only for its own address);
  `convertAppManifest(code)` exchanges the code for the App's id, private key and webhook secret. Names, permissions
  and webhook URLs are arguments; nothing is Holocron-specific.
