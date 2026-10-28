import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { env } from "../../env/index.js";
import { DRY_RUN_NOOP_EXIT_CODE, DRY_RUN_PREVIEW_ENV_VAR } from "../../interactive-menu/index.js";
import { reportError } from "../../observability/logger/index.js";
import { resolveOtp, runPublish, runSteadyPublish, runSyncTrust } from "./index.js";
import { type PublishArgs, publishArgs } from "./publish.args.js";

export const publishCommand: CommandModule<GlobalArgs, PublishArgs> = {
	command: "publish",
	describe: "Publish @theholocron/* packages to npm",
	builder: publishArgs,
	handler: async (argv) => {
		const otp = resolveOtp(argv.otp as string | undefined, env);
		if (argv.syncTrust) {
			const [oldFile, newFile] = argv.syncTrust as [string?, string?];
			if (!oldFile || !newFile) {
				reportError("publish --sync-trust requires exactly two values: <old-file> <new-file>");
				process.exitCode = 1;
				return;
			}
			const report = await runSyncTrust({
				cwd: argv.cwd,
				oldFile,
				newFile,
				dryRun: argv.dryRun,
				...(argv.group ? { group: argv.group as string } : {}),
				...(argv.excludeGroup?.length ? { excludeGroups: argv.excludeGroup as string[] } : {}),
				...(argv.repo ? { repo: argv.repo as string } : {}),
			});
			if (report.status === "fail") {
				process.exitCode = 1;
			}
			return;
		}
		if (argv.initial) {
			const report = await runPublish({
				cwd: argv.cwd,
				dryRun: argv.dryRun,
				...(argv.group ? { group: argv.group as string } : {}),
				...(argv.excludeGroup?.length ? { excludeGroups: argv.excludeGroup as string[] } : {}),
				...(argv.tag ? { tag: argv.tag as string } : {}),
				...(otp ? { otp } : {}),
			});
			if (report.status === "fail") {
				process.exitCode = 1;
			} else if (
				report.status === "ok" &&
				report.packageNames.length === 0 &&
				env.get(DRY_RUN_PREVIEW_ENV_VAR) === "1"
			) {
				// Every publicly publishable package already exists on npm —
				// nothing the real run would do either. Same signal clone's
				// "already cloned" case uses to skip the menu's follow-up
				// "proceed with the real run?" question.
				process.exitCode = DRY_RUN_NOOP_EXIT_CODE;
			}
			return;
		}
		const report = await runSteadyPublish({
			cwd: argv.cwd,
			dryRun: argv.dryRun,
			provenance: argv.provenance as boolean,
			skipAlreadyPublished: argv.skipAlreadyPublished as boolean,
			...(argv.group ? { group: argv.group as string } : {}),
			...(argv.excludeGroup?.length ? { excludeGroups: argv.excludeGroup as string[] } : {}),
			...(argv.tag ? { tag: argv.tag as string } : {}),
			...(otp ? { otp } : {}),
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
