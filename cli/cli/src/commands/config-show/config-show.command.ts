import type { CommandModule } from "yargs";

import type { GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { viewJson } from "../../ui/index.js";
import { type ConfigShowArgs, configShowArgs } from "./config-show.args.js";

export const configShowCommand: CommandModule<GlobalArgs, ConfigShowArgs> = {
	command: "config show",
	describe: "Print the resolved holocron config",
	builder: configShowArgs,
	handler: async (argv) => {
		const loaded = await loadConfig(argv.cwd);
		await viewJson(loaded.resolved, { depth: argv.depth, interactive: argv.interactive });
	},
};
