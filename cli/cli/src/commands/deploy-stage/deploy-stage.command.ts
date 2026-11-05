import { resolve } from "node:path";

import type { CommandModule } from "yargs";

import { reportError } from "../../observability/logger/index.js";
import type { DeployArgs } from "../deploy/deploy.args.js";
import { type DeployStageArgs, deployStageArgs } from "./deploy-stage.args.js";
import { stageDeploy } from "./deploy-stage.js";

export const deployStageCommand: CommandModule<DeployArgs, DeployStageArgs> = {
	command: "stage",
	describe:
		"Assemble the payload `deploy --files` uploads for a Vercel Function package (built bundle, entry, trimmed package.json)",
	builder: deployStageArgs,
	handler: (argv) => {
		const packageDir = resolve(argv.cwd as string, (argv.packageDir as string | undefined) ?? ".");
		const report = stageDeploy({
			packageDir,
			...(argv.out ? { outDir: resolve(argv.cwd as string, argv.out as string) } : {}),
			print: (line) => console.log(line),
		});
		if (report.status === "fail") {
			reportError(`deploy stage: ${report.message}`);
			process.exitCode = 1;
		}
	},
};
