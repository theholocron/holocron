import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { runDoctorReleases } from "./doctor-releases.js";

export const doctorReleasesCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "releases",
	describe:
		"Check that npm received every release tag, and name the tag and note to delete when it did not (read-only)",
	handler: async (argv) => {
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDoctorReleases({ loaded, context: { repoRoot: argv.cwd } });
		if (report.status === "fail") process.exitCode = 1;
	},
};
