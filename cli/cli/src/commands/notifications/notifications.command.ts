import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { notificationsLinkCommand } from "../notifications-link/notifications-link.command.js";

export const notificationsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "notifications",
	describe: "Link a GitHub account to a member of a notifications service",
	builder: (y: Argv<GlobalArgs>) =>
		y.command(notificationsLinkCommand as never).command(groupMenu("notifications") as never),
	handler: () => {},
};
