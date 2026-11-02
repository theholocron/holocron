import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { type AuthSetArgs, authSetArgs } from "./auth-set.args.js";
import { runAuthSet } from "./index.js";

/**
 * The `credentials` provider and environment the repo's config names, or `undefined` when there is no config
 * (`auth set` is a global command and runs anywhere) or it names none.
 */
async function credentialsOf(cwd: string): Promise<{ provider: string; environment: string } | undefined> {
	try {
		const { resolved } = await loadConfig(cwd);
		const entry = resolved.providers.credentials;
		const environment = resolved.credentials?.environment;
		const provider = entry?.cardinality === "many" ? entry.tuples[0]?.provider : undefined;
		return provider && environment ? { provider, environment } : undefined;
	} catch {
		return undefined;
	}
}

export const authSetCommand: CommandModule<GlobalArgs, AuthSetArgs> = {
	command: "set [provider] [value]",
	describe: "Verify + store a bootstrap token for a provider",
	builder: authSetArgs,
	handler: async (argv) => {
		const [provider] = await promptForPositionals(getEntry("auth set"), argv as Record<string, unknown>);
		const credentials = await credentialsOf(argv.cwd);
		const result = await runAuthSet({
			provider: provider!,
			...(argv.value ? { positional: argv.value as string } : {}),
			...(argv.org ? { org: argv.org as string } : {}),
			...(credentials ? { credentials } : {}),
		});
		if (result.status === "fail") process.exitCode = 1;
	},
};
