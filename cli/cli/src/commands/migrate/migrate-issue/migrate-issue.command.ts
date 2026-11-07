import type { Argv, CommandModule } from "yargs";

import type { GlobalArgs } from "../../global-args/index.js";
import { handleMigrate, type MigrateArgs } from "../migrate-handler/index.js";
import { migrateOptions } from "../migrate-options/index.js";

export const migrateIssueCommand: CommandModule<GlobalArgs, MigrateArgs & { key: string }> = {
	command: "issue <key>",
	describe: "Move one issue from one tracker to another, with its comments, labels and priority",
	builder: (y: Argv<GlobalArgs>) =>
		migrateOptions(y).positional("key", {
			type: "string",
			demandOption: true,
			describe: "The issue in the source tracker (#42, ENG-42)",
		}) as never,
	handler: (argv) => handleMigrate(argv, () => ({ kind: "issue", key: argv.key })),
};
