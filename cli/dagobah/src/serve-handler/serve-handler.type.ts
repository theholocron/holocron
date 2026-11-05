import type { DescribeLoggingOptions } from "../dev-logging/index.js";

/** What {@link serveHandler} needs. */
export interface ServeHandlerInput<K extends string> {
	/** The 1Password Environment holding the secrets, unless the process already has every `required` variable. */
	environment: string;
	/** The variables the handler cannot run without. */
	required: readonly K[];
	/** Imports the handler. Called after the environment is in `process.env`, because a handler that builds its logger from `process.env` when its module loads would otherwise see the wrong one. */
	handler: () => Promise<(request: Request, env: Record<K, string> & NodeJS.ProcessEnv) => Promise<Response>>;
	/** Which variables hold the Axiom token and dataset, to say where this run's logs go. Omit to say nothing about logs. */
	logging?: DescribeLoggingOptions | undefined;
	/** The port to listen on. `0` picks a free one. */
	port: number;
	/** The only path served. Default `/api/webhook`. */
	path?: string | undefined;
	/** The variables in the process. Default `process.env`. */
	env?: NodeJS.ProcessEnv | undefined;
	/** One line of output. Default `console.log`. */
	log?: ((line: string) => void) | undefined;
	/** Called on SIGINT and SIGTERM to stop the server and exit. Default `process.exit(0)` after the server closes. */
	onSignal?: ((close: () => Promise<void>) => void) | undefined;
}
