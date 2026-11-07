import type { Argv, CommandModule } from "yargs";

import type { GlobalArgs } from "../../global-args/index.js";
import { handleMigrate, type MigrateArgs } from "../migrate-handler/index.js";
import { migrateOptions } from "../migrate-options/index.js";

export const migrateProjectCommand: CommandModule<GlobalArgs, MigrateArgs & { name: string }> = {
	command: "project <name>",
	describe:
		"Move a board's issues to another tracker, with the board's status and priority; they land in a project of the same name",
	builder: (y: Argv<GlobalArgs>) =>
		migrateOptions(y).positional("name", {
			type: "string",
			demandOption: true,
			describe: "The board in the source tracker, by name",
		}) as never,
	handler: (argv) => handleMigrate(argv, (owner) => ({ kind: "project", name: argv.name, owner })),
};
