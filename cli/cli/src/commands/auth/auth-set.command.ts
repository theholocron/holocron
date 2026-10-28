import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { type AuthSetArgs, authSetArgs } from "./auth-set.args.js";
import { runAuthSet } from "./index.js";

export const authSetCommand: CommandModule<GlobalArgs, AuthSetArgs> = {
	command: "set [provider] [value]",
	describe: "Verify + store a bootstrap token for a provider",
	builder: authSetArgs,
	handler: async (argv) => {
		const [provider] = await promptForPositionals(getEntry("auth set"), argv as Record<string, unknown>);
		const result = await runAuthSet({
			provider: provider!,
			...(argv.value ? { positional: argv.value as string } : {}),
			...(argv.org ? { org: argv.org as string } : {}),
		});
		if (result.status === "fail") process.exitCode = 1;
	},
};
