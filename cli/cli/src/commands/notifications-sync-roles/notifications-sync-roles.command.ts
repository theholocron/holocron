import type { CommandModule } from "yargs";

import { applyResolvedConfig, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runNotificationsSyncRoles } from "./index.js";
import { type NotificationsSyncRolesArgs, notificationsSyncRolesArgs } from "./notifications-sync-roles.args.js";

export const notificationsSyncRolesCommand: CommandModule<GlobalArgs, NotificationsSyncRolesArgs> = {
	command: "sync-roles",
	describe: "Make who holds a server role match a team, through the links file",
	builder: notificationsSyncRolesArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runNotificationsSyncRoles({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			...(argv.provider ? { provider: argv.provider as string } : {}),
			keep: argv.keep as boolean,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
