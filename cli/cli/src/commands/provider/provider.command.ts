import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runProvider } from "./provider.js";
import type { ProviderArgs } from "./provider.type.js";

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
		.option("yes", {
			type: "boolean",
			default: false,
			describe: "Run `setup` without asking first (required without a terminal)",
		});

export const providerCommand: CommandModule<GlobalArgs, ProviderArgs> = {
	command: "provider [provider] [action]",
	describe: "Set up or check what only one provider has, from its own block of holocron.config",
	builder: providerArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runProvider({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.provider ? { provider: argv.provider } : {}),
			...(argv.action ? { action: argv.action } : {}),
			yes: argv.yes,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
