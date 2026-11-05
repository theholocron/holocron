import type { Argv, CommandModule } from "yargs";

import { applyResolvedConfig, type GlobalArgs, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runDoctorProject } from "./doctor-project.js";
import type { DoctorProjectArgs } from "./doctor-project.type.js";

const doctorProjectArgs = (y: Argv<GlobalArgs>): Argv<DoctorProjectArgs> =>
	y.option("post", {
		type: "string",
		describe:
			"After the run, post the result to a channel as the bot: the failing rows, or only the summary when none failed (default channel: alerts)",
	});

export const doctorProjectCommand: CommandModule<GlobalArgs, DoctorProjectArgs> = {
	command: "project",
	describe: "Compare each declared project board with its template, and report items that need a status (read-only)",
	builder: doctorProjectArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDoctorProject({
			loaded,
			context: { repoRoot: argv.cwd, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			// A bare `--post` is an empty string: the default channel.
			...(argv.post !== undefined ? { post: argv.post || "alerts" } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
