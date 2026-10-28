import type { CommandModule } from "yargs";

import { applyResolvedConfig, type GlobalArgs, parseScope, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { type DoctorNotificationsArgs, doctorNotificationsArgs } from "./doctor-notifications.args.js";
import { runDoctorNotifications } from "./doctor-notifications.js";

export const doctorNotificationsCommand: CommandModule<GlobalArgs, DoctorNotificationsArgs> = {
	command: "notifications",
	describe:
		"Check the layout against the server and the secrets store, step by step (a full run leaves one test post in the test channel; --built-only posts nothing unless --deliver)",
	builder: doctorNotificationsArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDoctorNotifications({
			loaded,
			context: {
				repoRoot: argv.cwd,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			...(argv.scope ? { scope: parseScope(argv.scope) } : {}),
			...(argv.provider ? { provider: argv.provider } : {}),
			...(argv.builtOnly ? { builtOnly: true } : {}),
			...(argv.deliver ? { deliver: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
