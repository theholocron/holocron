import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runUpdateIncident } from "./run-update-incident/index.js";

type Args = GlobalArgs & {
	id: string;
	page?: string;
	status?: "investigating" | "identified" | "monitoring";
	message?: string;
	notify?: boolean;
	yes?: boolean;
};

export const updateIncidentCommand: CommandModule<GlobalArgs, Args> = {
	command: "incident <id>",
	describe: "Append an update to a status page incident (investigating, identified or monitoring)",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.positional("id", {
				type: "string",
				demandOption: true,
				describe: "The incident's id, as `new incident` printed it",
			})
			.option("page", { type: "string", describe: "The declared status page, when several are declared" })
			.option("status", {
				type: "string",
				choices: ["investigating", "identified", "monitoring"] as const,
				demandOption: true,
				describe: "The status the update puts the incident in (`close incident` resolves one)",
			})
			.option("message", { type: "string", demandOption: true, describe: "What the update says" })
			.option("notify", {
				type: "boolean",
				default: true,
				describe: "Tell the page's subscribers (--no-notify to leave them)",
			})
			.option("yes", { type: "boolean", describe: "Write it without asking (required without a terminal)" }),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runUpdateIncident({
			mode: "update",
			id: String(argv.id),
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.page ? { page: argv.page } : {}),
			...(argv.status ? { status: argv.status } : {}),
			...(argv.message !== undefined ? { message: argv.message } : {}),
			notify: argv.notify !== false,
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
