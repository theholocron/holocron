import type { CommandModule } from "yargs";

import { applyResolvedConfig, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runNotificationsLink } from "./index.js";
import { type NotificationsLinkArgs, notificationsLinkArgs } from "./notifications-link.args.js";

export const notificationsLinkCommand: CommandModule<GlobalArgs, NotificationsLinkArgs> = {
	command: "link",
	describe: "Link your server account to your GitHub account by signing in with the provider",
	builder: notificationsLinkArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runNotificationsLink({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			...(argv.provider ? { provider: argv.provider as string } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
