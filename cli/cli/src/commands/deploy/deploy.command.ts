import { createEnvLookup } from "@theholocron/env-utils/lookup";
import { promptForPositionals } from "@theholocron/kyber/prompts";
import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { reportError } from "../../observability/logger/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { cleanupPreviewCommand } from "../cleanup-preview/cleanup-preview.command.js";
import { deployStageCommand } from "../deploy-stage/deploy-stage.command.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { type DeployArgs, deployArgs } from "./deploy.args.js";
import { deployOnReleaseCommand } from "./deploy-on-release.command.js";
import { runDeploy, runDeployFromFiles } from "./index.js";

const env = createEnvLookup();

export const deployCommand: CommandModule<GlobalArgs, DeployArgs> = {
	command: "deploy [branch]",
	describe: "Trigger a deployment via the configured `deployment` capability",
	builder: (y: Argv<GlobalArgs>) =>
		deployArgs(y)
			.command(cleanupPreviewCommand as never)
			.command(deployOnReleaseCommand as never)
			.command(deployStageCommand as never),
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
				projectId: argv.projectId,
				dir: argv.files,
				...(argv.target ? { target: argv.target } : {}),
				...(env.get("HOLOCRON_PREVIEW_KEY") ? { previewKey: env.get("HOLOCRON_PREVIEW_KEY") } : {}),
			});
			if (report.status === "fail") {
				process.exitCode = 1;
			}
			return;
		}

		const [branch] = await promptForPositionals(getEntry("deploy"), argv);
		const report = await runDeploy({
			loaded,
			context,
			projectId: argv.projectId,
			branch: branch,
			...(argv.target ? { target: argv.target } : {}),
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
