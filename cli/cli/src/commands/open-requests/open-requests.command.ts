import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runOpenRequests } from "./run-open-requests/index.js";

type Args = GlobalArgs & { environment?: string[]; to?: string; yes?: boolean };

export const openRequestsCommand: CommandModule<GlobalArgs, Args> = {
	command: "requests",
	describe: "Open the request tool's workspace with its secrets filled in from the layer's vault Environment",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.option("environment", {
				type: "string",
				array: true,
				describe:
					"The layers to read the secrets from: `local`, `dev` or `prod`, repeated or comma-separated (default: `dev` alone; `prod` only when named)",
			})
			.option("to", {
				type: "string",
				describe: "Open only for this tooling provider (needed when more than one can open its workspace)",
			})
			.option("yes", {
				type: "boolean",
				describe: "Go ahead without asking (required without a terminal)",
			}),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runOpenRequests({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.environment ? { environments: argv.environment } : {}),
			...(argv.to ? { to: argv.to } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
