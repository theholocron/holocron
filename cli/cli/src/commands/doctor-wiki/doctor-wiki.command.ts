import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runDoctorWiki } from "./doctor-wiki.js";

export const doctorWikiCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "wiki",
	describe: "Check the wiki's organization, docs site, domain and published pages (read-only)",
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDoctorWiki({
			loaded,
			context: { repoRoot: argv.cwd, ...tokens, org: resolveOrg(argv, loaded.resolved) },
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
