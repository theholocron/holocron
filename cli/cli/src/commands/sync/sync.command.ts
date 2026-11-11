import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { ideasSyncCommand } from "../ideas-sync/index.js";
import { notificationsSyncRolesCommand } from "../notifications-sync-roles/notifications-sync-roles.command.js";
import { resolveOrg } from "../resolve-org/index.js";
import { secretsSyncCommand } from "../secrets-sync/secrets-sync.command.js";
import { specsSyncCommand } from "../specs-sync/specs-sync.command.js";
import { syncGithubCommand } from "../sync-github/sync-github.command.js";
import { syncIssuesCommand } from "../sync-issues/index.js";
import { syncReadmeCommand } from "../sync-readme/sync-readme.command.js";
import { tokenContext } from "../token-context/index.js";
import { runSync } from "./index.js";
import { type SyncArgs, syncArgs } from "./sync.args.js";

export const syncCommand: CommandModule<GlobalArgs, SyncArgs> = {
	command: "sync [steps..]",
	describe:
		"Sync state from config to the provider and local files (labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki)",
	builder: (y: Argv<GlobalArgs>) =>
		syncArgs(y)
			.command(syncGithubCommand as never)
			.command(syncIssuesCommand as never)
			.command(syncReadmeCommand as never)
			.command(ideasSyncCommand as never)
			.command(specsSyncCommand as never)
			.command(secretsSyncCommand as never)
			.command(notificationsSyncRolesCommand as never),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runSync({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...(argv.repo ? { repo: argv.repo } : {}),
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			...(argv.steps && argv.steps.length > 0 ? { steps: argv.steps as string[] } : {}),
		});
		if (report.summary.fail > 0) {
			process.exitCode = 1;
		}
	},
};
