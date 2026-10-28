import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { type AuthCheckArgs, authCheckArgs } from "./auth-check.args.js";
import { runAuthCheck } from "./index.js";

export const authCheckCommand: CommandModule<GlobalArgs, AuthCheckArgs> = {
	command: "check [provider]",
	describe: "Re-verify a stored bootstrap token",
	builder: authCheckArgs,
	handler: async (argv) => {
		const [provider] = await promptForPositionals(getEntry("auth check"), argv as Record<string, unknown>);
		const result = await runAuthCheck({
			provider: provider!,
			...(argv.org ? { org: argv.org as string } : {}),
		});
		if (result.status === "fail") process.exitCode = 1;
	},
};
