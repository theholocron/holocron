import { promptForPositionals } from "@theholocron/kyber/prompts";
import type { CommandModule } from "yargs";

import { getEntry } from "../../interactive-menu/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { type AuthCheckArgs, authCheckArgs } from "./auth-check.args.js";
import { runAuthCheck } from "./index.js";

export const authCheckCommand: CommandModule<GlobalArgs, AuthCheckArgs> = {
	command: "token [provider]",
	describe: "Re-verify a stored bootstrap token",
	builder: authCheckArgs,
	handler: async (argv) => {
		const [provider] = await promptForPositionals(getEntry("check token"), argv as Record<string, unknown>);
		const result = await runAuthCheck({
			provider: provider!,
			...(argv.org ? { org: argv.org as string } : {}),
		});
		if (result.status === "fail") process.exitCode = 1;
	},
};
