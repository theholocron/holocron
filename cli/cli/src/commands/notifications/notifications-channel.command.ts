import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { notificationsChannelAddCommand } from "../notifications-channel-add/notifications-channel-add.command.js";

export const notificationsChannelCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "channel",
	describe: "Manage notification channels",
	builder: (y: Argv<GlobalArgs>) =>
		y.command(notificationsChannelAddCommand as never).command(groupMenu("notifications channel") as never),
	handler: () => {},
};
