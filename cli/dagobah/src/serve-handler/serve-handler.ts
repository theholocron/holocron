import { loadDevEnv } from "../dev-env/index.js";
import { describeLogging } from "../dev-logging/index.js";
import type { DevServer } from "../dev-server/index.js";
import { startDevServer } from "../dev-server/index.js";
import type { ServeHandlerInput } from "./serve-handler.type.js";

/**
 * Runs a web-standard handler locally: loads its environment, puts it in `process.env`, imports the handler, serves
 * it on the loopback address and says where it is listening and where its logs go. The server stops, and the process
 * exits, on SIGINT and SIGTERM.
 *
 * @returns The running server.
 */
export async function serveHandler<K extends string>(input: ServeHandlerInput<K>): Promise<DevServer> {
	const log = input.log ?? ((line: string) => console.log(line));
	const settings = input.env ?? process.env;
	const env = loadDevEnv({ environment: input.environment, required: input.required, env: settings });
	// The handler may read process.env once, when its module loads, so what the Environment holds goes in before the
	// import and not after it.
	for (const [name, value] of Object.entries(env)) if (value !== undefined) process.env[name] = value;
	const handle = await input.handler();
	const server = await startDevServer({
		handle,
		env,
		port: input.port,
		...(input.path ? { path: input.path } : {}),
		log,
	});
	log(`listening on ${server.url}, secrets from "${input.environment}"`);
	if (input.logging) log(describeLogging(env, input.logging));
	const stop = input.onSignal ?? ((close) => void close().then(() => process.exit(0)));
	for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop(server.close));
	return server;
}
