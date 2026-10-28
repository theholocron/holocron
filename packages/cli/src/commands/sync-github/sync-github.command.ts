import type { CommandModule } from "yargs";

import { createFeatureResolver } from "../../auth/index.js";
import { AuthError } from "../../auth/index.js";
import { tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { reportError } from "../../observability/logger/index.js";
import { runSyncGithub } from "./index.js";
import { type SyncGithubArgs, syncGithubArgs } from "./sync-github.args.js";

const resolveSyncToken = createFeatureResolver({ envName: "HOLOCRON_SYNC_TOKEN", keyringKey: "github.sync" });

export const syncGithubCommand: CommandModule<GlobalArgs, SyncGithubArgs> = {
	command: "github",
	describe: "Sync workflow templates and composite actions to theholocron/.github",
	builder: syncGithubArgs,
	handler: async (argv) => {
		const outputDir = argv["output-dir"] as string | undefined;
		const parsed = tokenContext(argv.token);
		if (!parsed) return;
		let token: string;
		if (outputDir) {
			token = "no-token-needed";
		} else {
			try {
				token = resolveSyncToken({
					cliToken: parsed.cliTokens?.["github"] ?? parsed.cliToken,
				});
			} catch (err) {
				reportError(`sync-github: ${err instanceof AuthError ? err.message : String(err)}`);
				process.exitCode = 1;
				return;
			}
		}
		const report = await runSyncGithub({
			token,
			repo: argv.repo,
			dryRun: argv.dryRun,
			...(argv.branch ? { branch: argv.branch } : {}),
			...(argv.pr ? { createPr: true } : {}),
			...(argv.message ? { message: argv.message } : {}),
			...(outputDir ? { outputDir } : {}),
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
