import type { CommandModule } from "yargs";

import { applyResolvedConfig, type GlobalArgs, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runDoctorDns } from "./doctor-dns.js";

export const doctorDnsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "dns",
	describe: "Check that the DNS records the config makes setup write exist and point where they should (read-only)",
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDoctorDns({
			loaded,
			context: { repoRoot: argv.cwd, ...tokens, org: resolveOrg(argv, loaded.resolved) },
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
