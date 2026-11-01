import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { runMoveTag } from "./index.js";
import { type MoveTagArgs, moveTagArgs } from "./move-tag.args.js";

export const moveTagCommand: CommandModule<GlobalArgs, MoveTagArgs> = {
	command: "move-tag [group] [version]",
	describe: "Move a version group's major tag (ci-v1) to its latest stable release (semantic-release publishCmd)",
	builder: moveTagArgs,
	handler: async (argv) => {
		const [group] = await promptForPositionals(getEntry("package move-tag"), argv as Record<string, unknown>);
		const report = await runMoveTag({
			group: group!,
			cwd: argv.cwd,
			dryRun: argv.dryRun,
			remote: argv.remote,
			...(argv.version ? { version: argv.version } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
