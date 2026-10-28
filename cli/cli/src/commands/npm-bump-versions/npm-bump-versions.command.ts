import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { runNpmBumpVersions } from "./index.js";
import { type NpmBumpVersionsArgs, npmBumpVersionsArgs } from "./npm-bump-versions.args.js";

export const npmBumpVersionsCommand: CommandModule<GlobalArgs, NpmBumpVersionsArgs> = {
	command: "bump-versions [new-version]",
	describe: "Bump all non-private package versions in lockstep (semantic-release prepareCmd)",
	builder: npmBumpVersionsArgs,
	handler: async (argv) => {
		const [newVersion] = await promptForPositionals(
			getEntry("package bump-versions"),
			argv as Record<string, unknown>
		);
		const report = await runNpmBumpVersions({
			version: newVersion!,
			cwd: argv.cwd,
			dryRun: argv.dryRun,
			...(argv.group ? { group: argv.group } : {}),
			...(argv.excludeGroup?.length ? { excludeGroups: argv.excludeGroup } : {}),
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
