import { promptForPositionals } from "@theholocron/kyber/prompts";
import type { CommandModule } from "yargs";

import { getEntry } from "../../interactive-menu/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { type AuthUnsetArgs, authUnsetArgs } from "./auth-unset.args.js";
import { runAuthUnset } from "./index.js";

export const authUnsetCommand: CommandModule<GlobalArgs, AuthUnsetArgs> = {
	command: "token [provider]",
	describe: "Remove a stored bootstrap token",
	builder: authUnsetArgs,
	handler: async (argv) => {
		const [provider] = await promptForPositionals(getEntry("remove token"), argv as Record<string, unknown>);
		runAuthUnset({ provider: provider! });
	},
};
