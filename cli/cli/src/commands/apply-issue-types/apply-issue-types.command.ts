import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runIssueTypesApply } from "./run-issue-types-apply/index.js";

export const applyIssueTypesCommand: CommandModule<GlobalArgs, GlobalArgs & { update?: boolean; yes?: boolean }> = {
	command: "issue-types",
	describe: "Make the organization's issue Types match the org area's issueTypes",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.option("update", {
				type: "boolean",
				describe:
					"Also set the description and colour of a Type that exists and differs (never its name or whether it is on)",
			})
			.option("yes", { type: "boolean", describe: "Change without asking" }),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runIssueTypesApply({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.update ? { update: true } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
