import { errorMessage } from "@theholocron/misc-utils";
import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { reportError } from "../../observability/logger/index.js";
import { runDevServe } from "./dev-serve.js";

export const devServeCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "serve",
	describe:
		"Serve the handler `dev.serve` names on PORT: the application `holocron dev` runs when it is configured, not usually run by hand",
	handler: async (argv) => {
		const loaded = await loadConfig(argv.cwd);
		const dev = loaded.resolved.dev;
		if (!dev?.serve) {
			reportError("dev serve: needs a handler in `dev.serve` in holocron.config.ts");
			process.exitCode = 1;
			return;
		}
		try {
			await runDevServe({
				cwd: argv.cwd,
				environment: dev.environment ?? "",
				serve: dev.serve,
				// `holocron dev` sets PORT to the tunnel's; the config's port is the fallback for a run by hand.
				port: Number(process.env["PORT"] ?? dev.port ?? 3000),
			});
		} catch (err) {
			reportError(`dev serve: ${errorMessage(err)}`);
			process.exitCode = 1;
		}
	},
};
