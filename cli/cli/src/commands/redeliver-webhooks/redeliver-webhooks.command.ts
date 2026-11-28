import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runRedeliverWebhooks } from "./run-redeliver-webhooks/index.js";

type Args = GlobalArgs & { since?: string; app?: string; yes?: boolean };

export const redeliverWebhooksCommand: CommandModule<GlobalArgs, Args> = {
	command: "webhooks",
	describe:
		"Ask GitHub to deliver again the webhooks each registered App's endpoint did not accept (the recovery step after a Sentinel outage)",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.option("since", {
				type: "string",
				describe: "How far back to look: a span (30m, 12h, 7d, 2w) or a date (default 1d)",
			})
			.option("app", { type: "string", describe: "Only this githubApps instance, by name" })
			.option("yes", { type: "boolean", describe: "Redeliver without asking (required without a terminal)" }),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runRedeliverWebhooks({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.since !== undefined ? { since: String(argv.since) } : {}),
			...(argv.app !== undefined ? { app: String(argv.app) } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
