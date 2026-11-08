import type { Argv, CommandModule } from "yargs";

import type { GlobalArgs } from "../../global-args/index.js";
import { handleMigrate, type MigrateArgs } from "../migrate-handler/index.js";
import { migrateOptions } from "../migrate-options/index.js";

export const migrateProjectCommand: CommandModule<GlobalArgs, MigrateArgs & { name: string }> = {
	command: "project <name>",
	describe:
		"Move a board's issues to another tracker, with the board's status and priority; they land on a board of the same name (GitHub) or in a project of that name (Linear)",
	builder: (y: Argv<GlobalArgs>) =>
		migrateOptions(y)
			.positional("name", {
				type: "string",
				demandOption: true,
				describe: "The board in the source tracker, by name",
			})
			.option("template", {
				type: "string",
				describe:
					"Board template to make a missing board from on a tracker with boards (GitHub); default roadmap",
			}) as never,
	handler: (argv) => handleMigrate(argv, (owner) => ({ kind: "project", name: argv.name, owner })),
};
