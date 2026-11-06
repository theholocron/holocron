import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { upgradeDepsCommand } from "../upgrade-deps/upgrade-deps.command.js";
import { upgradeNodeCommand } from "../upgrade-node/upgrade-node.command.js";

export const repoUpgradeCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "upgrade",
	describe: "Upgrade toolchain version pins across the repo",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(upgradeNodeCommand as never)
			.command(upgradeDepsCommand as never)
			.command(groupMenu("repo upgrade") as never),
	handler: () => {},
};
