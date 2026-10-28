import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { type AuthUnsetArgs, authUnsetArgs } from "./auth-unset.args.js";
import { runAuthUnset } from "./index.js";

export const authUnsetCommand: CommandModule<GlobalArgs, AuthUnsetArgs> = {
	command: "unset [provider]",
	describe: "Remove a stored bootstrap token",
	builder: authUnsetArgs,
	handler: async (argv) => {
		const [provider] = await promptForPositionals(getEntry("auth unset"), argv as Record<string, unknown>);
		runAuthUnset({ provider: provider! });
	},
};
