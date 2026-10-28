import { deployOnRelease } from "@theholocron/astromech";
import type { CommandModule } from "yargs";

import type { DeployArgs } from "./deploy.args.js";
import { type DeployOnReleaseArgs, deployOnReleaseArgs } from "./deploy-on-release.args.js";

export const deployOnReleaseCommand: CommandModule<DeployArgs, DeployOnReleaseArgs> = {
	command: "on-release",
	describe:
		"Deploy every workspace package whose delivery.deploy task is `on: release` — run by the delivery.publish workflow's deploy job",
	builder: deployOnReleaseArgs,
	handler: async (argv) => {
		const report = await deployOnRelease({
			cwd: argv.cwd as string,
			channel: argv.channel as string,
			// An empty value (an unset workflow output) means "not given".
			...(argv.from ? { from: argv.from as string } : {}),
			...(argv.to ? { to: argv.to as string } : {}),
			dryRun: argv.dryRun,
			print: (line) => console.log(line),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
