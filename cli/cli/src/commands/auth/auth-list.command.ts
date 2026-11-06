import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { runAuthList } from "./index.js";

export const authListCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "list",
	describe: "List every provider with a stored bootstrap token",

	handler: async () => {
		await runAuthList();
	},
};
