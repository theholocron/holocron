import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { parseScope } from "../secrets-sync/parse-scope/index.js";
import { tokenContext } from "../token-context/index.js";
import { runNotificationsSetup } from "./index.js";
import { type NotificationsSetupArgs, notificationsSetupArgs } from "./notifications-setup.args.js";

export const notificationsSetupCommand: CommandModule<GlobalArgs, NotificationsSetupArgs> = {
	command: "notifications",
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
