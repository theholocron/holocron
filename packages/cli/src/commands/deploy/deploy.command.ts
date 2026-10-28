import type { Argv, CommandModule } from "yargs";

import { applyResolvedConfig, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { reportError } from "../../observability/logger/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { cleanupPreviewCommand } from "../cleanup-preview/cleanup-preview.command.js";
import { type DeployArgs, deployArgs } from "./deploy.args.js";
import { deployOnReleaseCommand } from "./deploy-on-release.command.js";
import { runDeploy, runDeployFromFiles } from "./index.js";

export const deployCommand: CommandModule<GlobalArgs, DeployArgs> = {
	command: "deploy [branch]",
	describe: "Trigger a deployment via the configured `deployment` capability",
	builder: (y: Argv<GlobalArgs>) =>
		deployArgs(y)
			.command(cleanupPreviewCommand as never)
			.command(deployOnReleaseCommand as never),
	handler: async (argv) => {
		if (!argv.projectId) {
			reportError("deploy: missing required argument --project-id");
			process.exitCode = 1;
			return;
		}
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const context = {
			repoRoot: argv.cwd,
			dryRun: argv.dryRun,
			...tokens,
			org: resolveOrg(argv, loaded.resolved),
		};

		if (argv.files) {
			const report = await runDeployFromFiles({
				loaded,
				context,
				projectId: argv.projectId as string,
				dir: argv.files as string,
				...(argv.target ? { target: argv.target as "production" | "staging" } : {}),
			});
			if (report.status === "fail") {
				process.exitCode = 1;
			}
			return;
		}

		const [branch] = await promptForPositionals(getEntry("deploy"), argv as Record<string, unknown>);
		const report = await runDeploy({
			loaded,
			context,
			projectId: argv.projectId as string,
			branch: branch!,
			...(argv.target ? { target: argv.target as "production" | "staging" } : {}),
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
