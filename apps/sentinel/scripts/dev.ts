/**
 * `pnpm dev` — runs the handler locally, for a development instance behind a tunnel (holocron#1678).
 *
 * The App's secrets come from the process, or else from the 1Password Environment `SENTINEL_DEV_ENVIRONMENT`
 * (default `Sentinel - dev`), so a development App never reads production's. The server listens on `PORT`
 * (default 3000) on the loopback address only; the tunnel (`holocron tunnel up --cwd apps/sentinel --run`) is what
 * makes it reachable. Each request is logged as a line (method, path, status) and nothing else.
 */

import { loadDevEnv } from "../src/dev-env/index.js";
import { startDevServer } from "../src/dev-server/index.js";
import { handleWebhookRequest } from "../src/handler/index.js";

const environment = process.env["SENTINEL_DEV_ENVIRONMENT"] || "Sentinel - dev";
const port = Number(process.env["PORT"] || 3000);

try {
	const env = loadDevEnv({ environment });
	const server = await startDevServer({ handle: handleWebhookRequest, env, port, log: (line) => console.log(line) });
	console.log(`Sentinel (dev) listening on ${server.url}, secrets from "${environment}"`);
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.once(signal, () => void server.close().then(() => process.exit(0)));
	}
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
}
