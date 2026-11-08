import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import type { IssueOrder } from "../../plugin/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { type LimitArgs, limitOptions } from "../migrate/limit-options/index.js";
import { parseLimit } from "../migrate/parse-limit/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { parseSince } from "./parse-since/index.js";
import { runSyncIssues } from "./run-sync-issues/index.js";

type Args = GlobalArgs & LimitArgs & { from: string; to: string; since?: string; yes?: boolean };

export const syncIssuesCommand: CommandModule<GlobalArgs, Args> = {
	command: "issues",
	describe:
		"Keep issues on one tracker up to date from another, one direction: create what is missing, update what a sync made, add comments",
	builder: (y: Argv<GlobalArgs>) =>
		limitOptions(y)
			.option("from", {
				type: "string",
				demandOption: true,
				describe: "Where the issues are read from (never written): `provider` or `provider:key=value,...`",
			})
			.option("to", { type: "string", demandOption: true, describe: "Where they are written, in the same form" })
			.option("since", {
				type: "string",
				describe: "Only issues changed since this date or span back from now (2026-03-01, 7d, 12h)",
			})
			.option("yes", { type: "boolean", describe: "Sync without asking (a scheduled run needs it)" }) as never,
	handler: async (argv) => {
		const since = argv.since ? parseSince(argv.since) : undefined;
		const limit = parseLimit(argv.limit, "sync issues");
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const org = resolveOrg(argv, loaded.resolved);
		const report = await runSyncIssues({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org },
			from: argv.from,
			to: argv.to,
			...(since ? { since } : {}),
			...(limit === undefined ? {} : { limit, order: argv.order as IssueOrder }),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
