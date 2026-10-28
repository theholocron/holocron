import { readFileSync } from "node:fs";

import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { resolveMonitoringChecks } from "../monitoring-check/index.js";
import { runMonitoringRunResolved } from "./index.js";
import { type MonitoringRunResolvedArgs, monitoringRunResolvedArgs } from "./monitoring-run-resolved.args.js";

export const monitoringRunResolvedCommand: CommandModule<GlobalArgs, MonitoringRunResolvedArgs> = {
	command: "run-resolved <url>",
	describe:
		"Run an already-resolved check list (from `monitoring resolve-checks`) against a URL — no config/plugin loading at all, the trusted half of the delivery.previewCheck split (holocron#1030/#1032)",
	builder: monitoringRunResolvedArgs,
	handler: async (argv) => {
		const checks = JSON.parse(readFileSync(argv.checksFile as string, "utf8")) as Awaited<
			ReturnType<typeof resolveMonitoringChecks>
		>;
		const report = await runMonitoringRunResolved({
			checks,
			url: argv.url as string,
			...(argv.vercelProject ? { vercelProject: argv.vercelProject as string } : {}),
			...(process.env["VERCEL_TOKEN"] ? { vercelToken: process.env["VERCEL_TOKEN"] } : {}),
			...(process.env["VERCEL_TEAM_ID"] ? { vercelTeamId: process.env["VERCEL_TEAM_ID"] } : {}),
			...(process.env["VERCEL_PROTECTION_BYPASS_SECRET"]
				? { bypassSecret: process.env["VERCEL_PROTECTION_BYPASS_SECRET"] }
				: {}),
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
