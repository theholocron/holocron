import type { CommandModule } from "yargs";

import { applyResolvedConfig, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runNotificationsCreateServer } from "./index.js";
import {
	type NotificationsCreateServerArgs,
	notificationsCreateServerArgs,
} from "./notifications-create-server.args.js";

export const notificationsCreateServerCommand: CommandModule<GlobalArgs, NotificationsCreateServerArgs> = {
	command: "create-server",
	describe: "Create the server the layout describes, apply it, invite its owner and hand it over",
	builder: notificationsCreateServerArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runNotificationsCreateServer({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			owner: argv.owner as string,
			...(argv.name ? { name: argv.name as string } : {}),
			...(argv.provider ? { provider: argv.provider as string } : {}),
			...(argv.force ? { force: true } : {}),
			...(argv.resume ? { resume: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
