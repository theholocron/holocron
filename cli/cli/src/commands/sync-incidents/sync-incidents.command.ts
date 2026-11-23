import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { parseSince } from "../sync-issues/parse-since/index.js";
import { tokenContext } from "../token-context/index.js";
import { runSyncIncidents } from "./run-sync-incidents/index.js";

type Args = GlobalArgs & { since?: string; provider?: string; yes?: boolean };

export const syncIncidentsCommand: CommandModule<GlobalArgs, Args> = {
	command: "incidents",
	describe:
		"Mirror a status page's incidents into the forum that has `feeds.incidents`: one post each, updates appended",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.option("since", {
				type: "string",
				describe:
					"Also read incidents resolved since this date or span back from now (default 2d: 2026-03-01, 7d, 12h)",
			})
			.option("provider", {
				type: "string",
				describe: "The `notifications` provider to post through, when several are configured",
			})
			.option("yes", { type: "boolean", describe: "Post without asking (a scheduled run needs it)" }),
	handler: async (argv) => {
		const since = argv.since ? parseSince(argv.since) : undefined;
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runSyncIncidents({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(since ? { since } : {}),
			...(argv.provider ? { provider: argv.provider } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
