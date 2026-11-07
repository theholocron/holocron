import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { migrateIssueCommand } from "./migrate-issue/index.js";
import { migrateIssuesCommand } from "./migrate-issues/index.js";
import { migrateProjectCommand } from "./migrate-project/index.js";

export const migrateCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "migrate <subcommand>",
	describe:
		"Move issues, or a whole board, from one tracker to another (GitHub and Linear) and say what did not carry over",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(migrateIssueCommand as never)
			.command(migrateIssuesCommand as never)
			.command(migrateProjectCommand as never)
			.command(groupMenu("migrate") as never),
	handler: () => {},
};
