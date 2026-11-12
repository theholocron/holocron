import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { notificationsDedupeCommand } from "../notifications-dedupe/notifications-dedupe.command.js";
import { notificationsLinkCommand } from "../notifications-link/notifications-link.command.js";
import { notificationsSetupCommand } from "../notifications-setup/notifications-setup.command.js";

export const notificationsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "notifications",
	describe: "Provision notification channels, webhooks and roles",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(notificationsSetupCommand as never)
			.command(notificationsLinkCommand as never)
			.command(notificationsDedupeCommand as never)
			.command(groupMenu("notifications") as never),
	handler: () => {},
};
