import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { moveTagCommand } from "../move-tag/move-tag.command.js";
import { npmBumpVersionsCommand } from "../npm-bump-versions/npm-bump-versions.command.js";
import { publishCommand } from "../publish/publish.command.js";

export const packageCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "package",
	describe: "Version and publish workspace packages",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(npmBumpVersionsCommand as never)
			.command(moveTagCommand as never)
			.command(publishCommand as never)
			.command(groupMenu("package") as never),
	handler: () => {},
};
