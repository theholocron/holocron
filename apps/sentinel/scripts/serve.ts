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

import { serveHandler } from "@theholocron/dagobah";
import { createEnvLookup } from "@theholocron/env-utils/lookup";

const settings = createEnvLookup();

try {
	await serveHandler({
		environment: settings.get("SENTINEL_DEV_ENVIRONMENT") ?? "Sentinel - dev",
		required: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "SENTINEL_WEBHOOK_SECRET"],
		logging: { tokenVar: "SENTINEL_AXIOM_INGEST_TOKEN", datasetVar: "AXIOM_DATASET" },
		port: Number(settings.get("PORT") ?? 3000),
		handler: async () => (await import("../src/handler/index.js")).handleWebhookRequest,
	});
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
}
