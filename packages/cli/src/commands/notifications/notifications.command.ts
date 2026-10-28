import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { notificationsCreateServerCommand } from "../notifications-create-server/notifications-create-server.command.js";
import { notificationsLinkCommand } from "../notifications-link/notifications-link.command.js";
import { notificationsSetupCommand } from "../notifications-setup/notifications-setup.command.js";
import { notificationsSyncRolesCommand } from "../notifications-sync-roles/notifications-sync-roles.command.js";
import { notificationsChannelCommand } from "./notifications-channel.command.js";

export const notificationsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "notifications",
	describe: "Provision notification channels, webhooks and roles",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(notificationsChannelCommand as never)
			.command(notificationsSetupCommand as never)
			.command(notificationsCreateServerCommand as never)
			.command(notificationsLinkCommand as never)
			.command(notificationsSyncRolesCommand as never)
			.command(groupMenu("notifications") as never),
	handler: () => {},
};
