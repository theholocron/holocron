import type { CommandModule } from "yargs";

import { applyResolvedConfig, type GlobalArgs, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { buildProbeMenuEntries, launchMenu } from "../../interactive-menu/index.js";
import { type ProbeArgs, probeArgs } from "./probe.args.js";
import { runProbeCommand } from "./probe.js";

export const probeCommand: CommandModule<GlobalArgs, ProbeArgs> = {
	command: "probe [provider] [probe]",
	describe: "Poke a live provider on purpose: inspect it, or run a proof that cleans up after itself",
	builder: probeArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runProbeCommand({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			...(argv.provider ? { provider: argv.provider } : {}),
			...(argv.probe ? { probe: argv.probe } : {}),
			dryRun: argv.dryRun,
			yes: argv.yes,
			// On a terminal, `holocron probe` opens a menu of every provider and probe instead of printing them.
			...(process.stdin.isTTY
				? {
						pick: (groups) =>
							launchMenu(
								buildProbeMenuEntries(groups),
								argv,
								"probe — choose a provider:",
								"Run `holocron probe` to list the probes.",
								["probe"]
							),
					}
				: {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
