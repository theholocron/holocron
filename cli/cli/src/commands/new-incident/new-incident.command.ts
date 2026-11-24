import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runNewIncident } from "./run-new-incident/index.js";

type Args = GlobalArgs & {
	title: string;
	page?: string;
	status?: "investigating" | "identified" | "monitoring";
	component?: string[];
	message?: string;
	notify?: boolean;
	allowDuplicate?: boolean;
	yes?: boolean;
};

export const newIncidentCommand: CommandModule<GlobalArgs, Args> = {
	command: "incident <title>",
	describe: "Open an incident on a status page, with its first update and the components it marks",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.positional("title", {
				type: "string",
				demandOption: true,
				describe: "The incident's name (at most 255 characters)",
			})
			.option("page", { type: "string", describe: "The declared status page, when several are declared" })
			.option("status", {
				type: "string",
				choices: ["investigating", "identified", "monitoring"] as const,
				describe: "The status the opening update carries (default investigating)",
			})
			.option("component", {
				type: "string",
				array: true,
				describe: "A component to mark and how badly: <name>=<maintenance|degraded|partial|major> (repeatable)",
			})
			.option("message", {
				type: "string",
				describe: "What the opening update says (default: a line for the status)",
			})
			.option("notify", {
				type: "boolean",
				default: true,
				describe: "Tell the page's subscribers (--no-notify to try one out)",
			})
			.option("allow-duplicate", {
				type: "boolean",
				describe: "Open it even when an open incident has the same title",
			})
			.option("yes", { type: "boolean", describe: "Open it without asking (required without a terminal)" }),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runNewIncident({
			title: String(argv.title),
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.page ? { page: argv.page } : {}),
			...(argv.status ? { status: argv.status } : {}),
			...(argv.component ? { components: argv.component.map(String) } : {}),
			...(argv.message !== undefined ? { message: argv.message } : {}),
			notify: argv.notify !== false,
			...(argv.allowDuplicate ? { allowDuplicate: true } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
