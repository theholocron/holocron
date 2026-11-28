import { createEnvLookup } from "@theholocron/env-utils/lookup";
import type { CommandModule } from "yargs";

import { DRY_RUN_NOOP_EXIT_CODE, DRY_RUN_PREVIEW_ENV_VAR } from "../../interactive-menu/index.js";
import { reportError } from "../../observability/logger/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOtp, runPublish, runSteadyPublish, runSyncTrust } from "./index.js";
import { type PublishArgs, publishArgs } from "./publish.args.js";

const env = createEnvLookup();

export const publishPackageCommand: CommandModule<GlobalArgs, PublishArgs> = {
	command: "package",
	describe: "Publish @theholocron/* packages to npm",
	builder: publishArgs,
	handler: async (argv) => {
		const otp = resolveOtp(argv.otp, env);
		if (argv.syncTrust) {
			const [oldFile, newFile] = argv.syncTrust as [string?, string?];
			if (!oldFile || !newFile) {
				reportError("publish package --sync-trust requires exactly two values: <old-file> <new-file>");
				process.exitCode = 1;
				return;
			}
			const report = await runSyncTrust({
				cwd: argv.cwd,
				oldFile,
				newFile,
				dryRun: argv.dryRun,
				force: argv.force,
				...(argv.group ? { group: argv.group } : {}),
				...(argv.excludeGroup?.length ? { excludeGroups: argv.excludeGroup } : {}),
				...(argv.package?.length ? { onlyPackages: argv.package } : {}),
				...(argv.repo ? { repo: argv.repo } : {}),
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
				...(argv.group ? { group: argv.group } : {}),
				...(argv.excludeGroup?.length ? { excludeGroups: argv.excludeGroup } : {}),
				...(argv.package?.length ? { onlyPackages: argv.package } : {}),
				...(argv.tag ? { tag: argv.tag } : {}),
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
		if (argv.package?.length) {
			reportError(
				"publish package --package works with --initial or --sync-trust; a steady-state publish takes the whole scope"
			);
			process.exitCode = 1;
			return;
		}
		const report = await runSteadyPublish({
			cwd: argv.cwd,
			dryRun: argv.dryRun,
			provenance: argv.provenance,
			skipAlreadyPublished: argv.skipAlreadyPublished,
			...(argv.group ? { group: argv.group } : {}),
			...(argv.excludeGroup?.length ? { excludeGroups: argv.excludeGroup } : {}),
			...(argv.tag ? { tag: argv.tag } : {}),
			...(otp ? { otp } : {}),
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
