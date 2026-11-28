import { promptForPositionals } from "@theholocron/kyber/prompts";
import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { parseScope } from "../secrets-sync/parse-scope/index.js";
import { tokenContext } from "../token-context/index.js";
import { runNotificationsChannelAdd } from "./index.js";
import { type NotificationsChannelAddArgs, notificationsChannelAddArgs } from "./notifications-channel-add.args.js";

export const notificationsChannelAddCommand: CommandModule<GlobalArgs, NotificationsChannelAddArgs> = {
	command: "channel [name]",
	describe: "Create a channel, optionally with a webhook whose URL is stored as a secret",
	builder: notificationsChannelAddArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const [name] = await promptForPositionals(getEntry("new channel"), argv);
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
			name: name,
			...(argv.category ? { category: argv.category } : {}),
			...(argv.topic ? { topic: argv.topic } : {}),
			...(argv.withWebhook ? { withWebhook: true } : {}),
			...(argv.webhookName ? { webhookName: argv.webhookName } : {}),
			...(argv.secret ? { secret: argv.secret } : {}),
			...(argv.scope ? { scope: parseScope(argv.scope) } : {}),
			...(argv.provider ? { provider: argv.provider } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
