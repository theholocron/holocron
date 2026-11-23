import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runDoctorCi } from "./doctor-ci.js";

type Args = GlobalArgs & { shadow?: boolean; limit?: number };

export const doctorCiCommand: CommandModule<GlobalArgs, Args> = {
	command: "ci",
	describe:
		"Check the repo against the flat task vocabulary: aliases, caller names, the ci aggregate, home (read-only)",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.option("shadow", {
				type: "boolean",
				describe:
					"Also compare Sentinel's shadow aggregate (ci / Required checks (sentinel)) with the Actions one on the newest pull requests (reads through `source`)",
			})
			.option("limit", {
				type: "number",
				describe: "With --shadow: how many of the newest pull requests to read (default 40)",
			}),
	handler: async (argv) => {
		// Only the shadow comparison reads through a provider, so only it needs a token.
		const tokens = argv.shadow ? tokenContext(argv.token) : {};
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDoctorCi({
			loaded,
			context: {
				repoRoot: argv.cwd,
				...tokens,
				...(argv.shadow ? { org: resolveOrg(argv, loaded.resolved) } : {}),
			},
			...(argv.shadow ? { shadow: true } : {}),
			...(argv.limit !== undefined ? { shadowLimit: Number(argv.limit) } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
