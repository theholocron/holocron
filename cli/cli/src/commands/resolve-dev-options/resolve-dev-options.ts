import type { DevConfig } from "../../config/index.js";
import type { DevFlags, ResolvedDevOptions } from "./resolve-dev-options.type.js";

/** The port used when neither a flag nor the config gives one. */
const DEFAULT_PORT = 3000;

/**
 * The options `holocron dev` runs with: a flag wins over the `dev` block of `holocron.config`, which wins over the
 * default port. Throws one message naming everything that is missing and where it could be given, so a first run does
 * not have to be fixed one error at a time.
 */
export function resolveDevOptions(flags: DevFlags, config: DevConfig | undefined): ResolvedDevOptions {
	const environment = flags.environment ?? config?.environment;
	const name = flags.name ?? config?.tunnel?.name;
	const hostname = flags.hostname ?? config?.tunnel?.hostname;
	const command = flags.command?.length ? flags.command : config?.command;

	const missing: string[] = [];
	if (!environment) missing.push("an environment (--environment, or `dev.environment`)");
	if (!name) missing.push("a tunnel name (--name, or `dev.tunnel.name`)");
	if (!hostname) missing.push("a hostname (--hostname, or `dev.tunnel.hostname`)");
	if (!command?.length) missing.push("the application's command (after --, or `dev.command`)");
	if (missing.length > 0) {
		throw new Error(`dev needs ${missing.join("; ")}, in holocron.config.ts or on the command line`);
	}
	return {
		environment: environment as string,
		name: name as string,
		hostname: hostname as string,
		port: flags.port ?? config?.port ?? DEFAULT_PORT,
		command: command as string[],
	};
}
