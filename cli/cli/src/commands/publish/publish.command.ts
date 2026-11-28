import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { moveTagCommand } from "../move-tag/move-tag.command.js";
import { npmBumpVersionsCommand } from "../npm-bump-versions/npm-bump-versions.command.js";
import { publishPackageCommand } from "./publish-package.command.js";

export const publishCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "publish",
	describe: "Version and publish workspace packages",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(npmBumpVersionsCommand as never)
			.command(moveTagCommand as never)
			.command(publishPackageCommand as never)
			.command(groupMenu("publish") as never),
	handler: () => {},
};
