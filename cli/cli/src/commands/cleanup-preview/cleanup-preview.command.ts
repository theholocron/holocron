import { promptForPositionals } from "@theholocron/kyber/prompts";
import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { DeployArgs } from "../deploy/deploy.args.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { type CleanupPreviewArgs, cleanupPreviewArgs } from "./cleanup-preview.args.js";
import { runCleanupPreview } from "./index.js";

export const cleanupPreviewCommand: CommandModule<DeployArgs, CleanupPreviewArgs> = {
	command: "cleanup-preview [pr]",
	describe: "List and delete Cloudflare Pages preview deployments for a GitHub PR",
	builder: cleanupPreviewArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const [pr] = await promptForPositionals(getEntry("deploy cleanup-preview"), argv as Record<string, unknown>);
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runCleanupPreview({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			prNumber: Number(pr),
			project: argv.project as string,
			...(argv.repo ? { repo: argv.repo as string } : {}),
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
