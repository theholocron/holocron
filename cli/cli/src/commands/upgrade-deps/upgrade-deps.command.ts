import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { reportError } from "../../observability/logger/index.js";
import { runUpgradeDeps } from "./index.js";
import { type UpgradeDepsArgs, upgradeDepsArgs } from "./upgrade-deps.args.js";

export const upgradeDepsCommand: CommandModule<GlobalArgs, UpgradeDepsArgs> = {
	command: "deps",
	describe: "Bump every @theholocron/* pin to latest and migrate holocron.config.ts to the current preset API",
	builder: upgradeDepsArgs,
	handler: async (argv) => {
		const report = await runUpgradeDeps({
			cwd: argv.cwd,
			dryRun: argv.dryRun,
			pinsOnly: argv.pinsOnly as boolean,
		});
		if (report.status === "fail") {
			if (report.message) reportError(`upgrade deps: ${report.message}`);
			process.exitCode = 1;
		}
	},
};
