import type { CommandModule } from "yargs";

import { applyResolvedConfig, parseScope, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runNotificationsSetup } from "./index.js";
import { type NotificationsSetupArgs, notificationsSetupArgs } from "./notifications-setup.args.js";

export const notificationsSetupCommand: CommandModule<GlobalArgs, NotificationsSetupArgs> = {
	command: "setup",
	describe: "Apply the server layout a notifications provider declares in holocron.config.ts",
	builder: notificationsSetupArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runNotificationsSetup({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			...(argv.scope ? { scope: parseScope(argv.scope as string) } : {}),
			...(argv.provider ? { provider: argv.provider as string } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
