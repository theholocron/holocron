/**
 * `holocron dev serve` — the application `holocron dev` runs when `dev.serve` names a handler: it loads the handler
 * and serves it on `PORT` (the tunnel's), with the variables `holocron dev` read from the vault already in its
 * environment. Run by hand it reads them from the vault environment itself, through `op`.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { serveHandler as serve } from "@theholocron/dagobah";

import type { RunDevServeInput } from "./dev-serve.type.js";

/** Imports a module by path, compiling TypeScript as it goes. */
async function importWithTsx(path: string): Promise<Record<string, unknown>> {
	const { tsImport } = await import("tsx/esm/api");
	return (await tsImport(pathToFileURL(path).href, import.meta.url)) as Record<string, unknown>;
}

/**
 * Serves the handler `dev.serve` names. The handler's module is imported after the environment is in `process.env`,
 * because one that reads `process.env` when it loads would otherwise see the wrong one.
 *
 * @throws When the module does not export a function under the configured name.
 */
export async function runDevServe(input: RunDevServeInput): Promise<void> {
	const importModule = input.importModule ?? importWithTsx;
	const name = input.serve.export ?? "default";
	await (input.serveHandler ?? serve)({
		environment: input.environment,
		required: input.serve.required ?? [],
		logging: input.serve.logging,
		port: input.port,
		handler: async () => {
			const path = resolve(input.cwd, input.serve.handler);
			const handler = (await importModule(path))[name];
			if (typeof handler !== "function") {
				throw new Error(`\`dev.serve\`: ${path} does not export a function named "${name}"`);
			}
			return handler as (request: Request, env: NodeJS.ProcessEnv & Record<string, string>) => Promise<Response>;
		},
	});
}
