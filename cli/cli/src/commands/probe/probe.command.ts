import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { buildProbeMenuEntries, launchMenu } from "../../interactive-menu/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { type ProbeArgs, probeArgs } from "./probe.args.js";
import { runProbeCommand } from "./probe.js";

export const probeCommand: CommandModule<GlobalArgs, ProbeArgs> = {
	command: "probe [provider] [probe] [args..]",
	describe: "Poke a live provider on purpose: inspect it, or run a proof that cleans up after itself",
	builder: probeArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		// The `tasks names` flags travel with the probe's arguments, which is all a probe sees.
		const args = [
			...(argv.args ?? []).map(String),
			...(argv.warn ? ["--warn"] : []),
			...(argv.files ? ["--files"] : []),
			...(argv.only ?? []).flatMap((name) => ["--only", String(name)]),
			...(argv.copy ? ["--copy"] : []),
		];
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
			...(args.length ? { args } : {}),
			...(argv.lcov ? { lcov: argv.lcov } : {}),
			dryRun: argv.dryRun,
			yes: argv.yes,
			// On a terminal, `holocron probe` opens a menu of every provider and probe instead of printing them.
			...(process.stdin.isTTY
				? {
						pick: (groups) =>
							launchMenu(buildProbeMenuEntries(groups), argv, {
								pickMessage: "probe — choose a provider:",
								nonInteractiveMessage: "Run `holocron probe` to list the probes.",
								startPath: ["probe"],
							}),
					}
				: {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
