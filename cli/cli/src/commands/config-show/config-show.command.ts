import { viewJson } from "@theholocron/kyber/ui";
import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { type ConfigShowArgs, configShowArgs } from "./config-show.args.js";

export const configShowCommand: CommandModule<GlobalArgs, ConfigShowArgs> = {
	command: "config",
	describe: "Print the resolved holocron config",
	builder: configShowArgs,
	handler: async (argv) => {
		const loaded = await loadConfig(argv.cwd);
		await viewJson(loaded.resolved, { depth: argv.depth, interactive: argv.interactive });
	},
};
