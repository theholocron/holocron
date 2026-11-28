import { deployOnRelease, recordDeploys } from "@theholocron/astromech";
import { createEnvLookup } from "@theholocron/env-utils/lookup";
import type { CommandModule } from "yargs";

import type { DeployArgs } from "./deploy.args.js";
import { type DeployOnReleaseArgs, deployOnReleaseArgs } from "./deploy-on-release.args.js";

export const deployOnReleaseCommand: CommandModule<DeployArgs, DeployOnReleaseArgs> = {
	command: "on-release",
	describe:
		"Deploy every workspace package whose delivery.deploy task is `on: release` — run by the delivery.publish workflow's deploy job",
	builder: deployOnReleaseArgs,
	handler: async (argv) => {
		const print = (line: string) => console.log(line);
		if (argv.record) {
			// The record phase: tags what the deploy phase listed. The token is read here and nowhere else.
			const report = recordDeploys({
				cwd: argv.cwd,
				file: argv.recordFile ?? "",
				token: createEnvLookup().get("GITHUB_TOKEN"),
				dryRun: argv.dryRun,
				print,
			});
			if (report.status === "fail") process.exitCode = 1;
			return;
		}
		const report = await deployOnRelease({
			cwd: argv.cwd,
			channel: argv.channel,
			// An empty value (an unset workflow output) means "not given".
			...(argv.from ? { from: argv.from } : {}),
			...(argv.to ? { to: argv.to } : {}),
			...(argv.recordFile ? { recordFile: argv.recordFile } : {}),
			dryRun: argv.dryRun,
			print,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
