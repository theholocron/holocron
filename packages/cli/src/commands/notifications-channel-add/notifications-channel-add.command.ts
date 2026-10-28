import type { CommandModule } from "yargs";

import { applyResolvedConfig, parseScope, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { runNotificationsChannelAdd } from "./index.js";
import { type NotificationsChannelAddArgs, notificationsChannelAddArgs } from "./notifications-channel-add.args.js";

export const notificationsChannelAddCommand: CommandModule<GlobalArgs, NotificationsChannelAddArgs> = {
	command: "add [name]",
	describe: "Create a channel, optionally with a webhook whose URL is stored as a secret",
	builder: notificationsChannelAddArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const [name] = await promptForPositionals(
			getEntry("notifications channel add"),
			argv as Record<string, unknown>
		);
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runNotificationsChannelAdd({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			name: name!,
			...(argv.category ? { category: argv.category as string } : {}),
			...(argv.topic ? { topic: argv.topic as string } : {}),
			...(argv.withWebhook ? { withWebhook: true } : {}),
			...(argv.webhookName ? { webhookName: argv.webhookName as string } : {}),
			...(argv.secret ? { secret: argv.secret as string } : {}),
			...(argv.scope ? { scope: parseScope(argv.scope as string) } : {}),
			...(argv.provider ? { provider: argv.provider as string } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
