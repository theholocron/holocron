import type { DevServeConfig } from "../../config/index.js";

/** What {@link runDevServe} needs. */
export interface RunDevServeInput {
	/** The directory the `dev.serve.handler` path is relative to. */
	cwd: string;
	/** The vault environment to fall back to when the process does not hold every required variable. */
	environment: string;
	/** The `dev.serve` block. */
	serve: DevServeConfig;
	/** The port to listen on. */
	port: number;
	/** Imports a module, TypeScript included. Injectable for testing. */
	importModule?: ((path: string) => Promise<Record<string, unknown>>) | undefined;
	/** Starts serving. Injectable for testing. */
	serveHandler?: typeof import("@theholocron/dagobah").serveHandler | undefined;
}
