import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runNotificationsDedupe } from "./index.js";
import { type NotificationsDedupeArgs, notificationsDedupeArgs } from "./notifications-dedupe.args.js";

export const notificationsDedupeCommand: CommandModule<GlobalArgs, NotificationsDedupeArgs> = {
	command: "dedupe [channel]",
	describe: "Delete the extra posts of a forum that has more than one post for the same key",
	builder: notificationsDedupeArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runNotificationsDedupe({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			...(argv.channel ? { channel: argv.channel as string } : {}),
			...(argv.provider ? { provider: argv.provider as string } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
