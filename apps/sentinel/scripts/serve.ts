/**
 * `pnpm serve` — runs the handler locally, for a development instance behind a tunnel (holocron#1678). `pnpm dev`
 * is the whole loop: `holocron dev` reads the Environment, sets up the tunnel and runs this beside it.
 *
 * The App's secrets come from the process, or else from the 1Password Environment `SENTINEL_DEV_ENVIRONMENT`
 * (default `Sentinel - dev`), so a development App never reads production's. The server listens on `PORT`
 * (default 3000) on the loopback address only; the tunnel (`holocron tunnel up --cwd apps/sentinel --run`) is what
 * makes it reachable. Each request is logged as a line (method, path, status) and nothing else. The handler's own
 * structured logs ship to Axiom when the Environment sets the ingest token and a dataset; use a dataset of its own
 * so a development run does not write into production's.
 */

import { createEnvLookup } from "@theholocron/env-utils/lookup";

import { loadDevEnv } from "../src/dev-env/index.js";
import { describeLogging } from "../src/dev-logging/index.js";
import { startDevServer } from "../src/dev-server/index.js";

const settings = createEnvLookup();
const environment = settings.get("SENTINEL_DEV_ENVIRONMENT") ?? "Sentinel - dev";
const port = Number(settings.get("PORT") ?? 3000);

try {
	const env = loadDevEnv({ environment });
	// The handler builds its logger from process.env once, when its module loads, so what the Environment holds
	// (the Axiom dataset and token) goes in before the import and not after it.
	for (const [name, value] of Object.entries(env)) if (value !== undefined) process.env[name] = value;
	const { handleWebhookRequest } = await import("../src/handler/index.js");
	const server = await startDevServer({ handle: handleWebhookRequest, env, port, log: (line) => console.log(line) });
	console.log(`Sentinel (dev) listening on ${server.url}, secrets from "${environment}"`);
	console.log(describeLogging(env));
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.once(signal, () => void server.close().then(() => process.exit(0)));
	}
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
}
