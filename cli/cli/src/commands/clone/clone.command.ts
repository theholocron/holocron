import { confirm } from "@inquirer/prompts";
import type { CommandModule } from "yargs";

import { createFeatureResolver } from "../../auth/index.js";
import { AuthError } from "../../auth/index.js";
import { tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { env } from "../../env/index.js";
import { DRY_RUN_NOOP_EXIT_CODE, DRY_RUN_PREVIEW_ENV_VAR, getEntry } from "../../interactive-menu/index.js";
import { reportError } from "../../observability/logger/index.js";
import { NonInteractiveError, openPath, promptForPositionals } from "../../ui/index.js";
import { type CloneArgs, cloneArgs } from "./clone.args.js";
import { parseCloneTarget, runClone, type WholeOrgScope } from "./index.js";

const resolveCloneToken = createFeatureResolver({ envName: "HOLOCRON_READ_TOKEN", keyringKey: "github.read" });

export const cloneCommand: CommandModule<GlobalArgs, CloneArgs> = {
	command: "clone [target]",
	describe: "Clone a single repo (org/repo) or every repo in an org (org)",
	builder: cloneArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		let token: string;
		try {
			token = resolveCloneToken({ cliToken: tokens.cliTokens?.["github"] ?? tokens.cliToken });
		} catch (err) {
			reportError(`clone: ${err instanceof AuthError ? err.message : String(err)}`);
			process.exitCode = 1;
			return;
		}
		const [targetInput] = await promptForPositionals(getEntry("clone"), argv as Record<string, unknown>);
		const { org, repo } = parseCloneTarget(targetInput);
		const report = await runClone({
			org,
			...(repo ? { repo } : {}),
			token,
			dryRun: argv.dryRun,
			...(argv.dir ? { dir: argv.dir } : {}),
			...(!repo
				? {
						confirmWholeOrg: async ({ total, alreadyCloned, toClone }: WholeOrgScope) => {
							if (!process.stdin.isTTY) {
								throw new NonInteractiveError(
									`clone: cloning every repo in "${org}" needs interactive confirmation — ` +
										`run this from a terminal, or pass a specific org/repo instead`
								);
							}
							if (toClone === 0) return true;
							return confirm({
								message: `${org} has ${total} repos — ${alreadyCloned} already cloned locally, ${toClone} new. Clone them all?`,
								default: false,
							});
						},
					}
				: {}),
			confirmOpen: async (openTarget: string, moreToCome: boolean) => {
				if (!process.stdin.isTTY) return;
				// A menu-launched preview with something it would actually clone
				// is about to ask "proceed with the real run?" — defer to there
				// instead of asking twice for the same directory. A direct
				// --dry-run invocation (no menu involved) has no such follow-up,
				// so it still asks now.
				if (moreToCome && env.get(DRY_RUN_PREVIEW_ENV_VAR) === "1") return;
				if (await confirm({ message: `Open ${openTarget}?`, default: false })) openPath(openTarget);
			},
		});
		if (report.status === "fail") {
			if (report.message) reportError(`clone: ${report.message}`);
			process.exitCode = 1;
		} else if (report.status === "dry-run" && report.cloned === 0 && env.get(DRY_RUN_PREVIEW_ENV_VAR) === "1") {
			process.exitCode = DRY_RUN_NOOP_EXIT_CODE;
		}
	},
};
