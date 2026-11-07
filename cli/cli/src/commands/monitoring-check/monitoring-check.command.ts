import { promptForPositionals } from "@theholocron/kyber/prompts";
import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveVercelBypassHeaders } from "../monitoring-run-resolved/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { resolveVercelCredentials } from "../resolve-vercel-credentials/index.js";
import { tokenContext } from "../token-context/index.js";
import { runMonitoringCheck } from "./index.js";
import { type MonitoringCheckArgs, monitoringCheckArgs } from "./monitoring-check.args.js";

export const monitoringCheckCommand: CommandModule<GlobalArgs, MonitoringCheckArgs> = {
	command: "check <url>",
	describe: "Run every configured `monitoring` check against a given URL instead of its own configured url",
	builder: monitoringCheckArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const [url] = await promptForPositionals(getEntry("monitoring check"), argv as Record<string, unknown>);
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		// Deployment Protection (on by default for Vercel Preview
		// deployments, holocron#1030) redirects an unauthenticated
		// request to Vercel's own SSO login before it ever reaches
		// the app being checked — this header is Vercel's documented
		// way for an automated caller to skip that wall. The token,
		// team id and secret come through the credential chain
		// (`resolveVercelCredentials`, no raw `process.env`); the team
		// id falls back to the configured Vercel provider's `teamId`.
		// Never attached without first verifying (via --vercel-project) that `url`
		// actually belongs to the expected project — sourcery review
		// on holocron#1032: a bare *.vercel.app hostname check proves
		// nothing, since anyone can register their own Vercel
		// project. This is the exact same gate `monitoring
		// run-resolved` uses for the CI split.
		const { headers } = await resolveVercelBypassHeaders({
			url: url!,
			...(argv.vercelProject ? { vercelProject: argv.vercelProject as string } : {}),
			...resolveVercelCredentials(loaded.resolved),
		});
		const report = await runMonitoringCheck({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			url: url!,
			...(headers ? { headers } : {}),
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
