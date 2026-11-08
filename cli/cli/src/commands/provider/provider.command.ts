import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runProvider } from "./provider.js";
import type { ProviderArgs } from "./provider.type.js";
import { readWithOptions } from "./read-with-options/index.js";

const providerArgs = (y: Argv<GlobalArgs>): Argv<ProviderArgs> =>
	y
		.positional("provider", {
			type: "string",
			describe: "Which provider (omit to list the ones that offer setup or doctor)",
		})
		.positional("action", {
			type: "string",
			describe: "`setup` or `doctor` (omit to list the provider's)",
		})
		.option("with", {
			type: "string",
			array: true,
			describe:
				"The provider's options when the config does not name it (or to override its entry): a `key=value` pair, " +
				"or a `.json`, `.ts` or `.js` file holding the options object; repeat to add more, a later one wins",
		})
		.option("yes", {
			type: "boolean",
			default: false,
			describe: "Run `setup` without asking first (required without a terminal)",
		});

export const providerCommand: CommandModule<GlobalArgs, ProviderArgs> = {
	command: "provider [provider] [action]",
	describe: "Set up or check what only one provider has, from its block of holocron.config or --with",
	builder: providerArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const options = await readWithOptions(argv.with, argv.cwd);
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runProvider({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.provider ? { provider: argv.provider } : {}),
			...(argv.action ? { action: argv.action } : {}),
			...(options ? { options } : {}),
			yes: argv.yes,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
