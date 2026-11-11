import type { Argv, CommandModule } from "yargs";

import { authSetCommand } from "../auth/auth-set.command.js";
import { githubAppCreateCommand } from "../github-app-create/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { ideasPromoteCommand } from "../ideas-promote/index.js";
import { notificationsChannelAddCommand } from "../notifications-channel-add/notifications-channel-add.command.js";
import { notificationsCreateServerCommand } from "../notifications-create-server/notifications-create-server.command.js";
import { pluginCreateCommand } from "../plugin-create/plugin-create.command.js";
import { projectCreateCommand } from "../project/project-create/index.js";
import { secretSetCommand } from "../secret-set/secret-set.command.js";
import { tunnelUpCommand } from "../tunnel-up/index.js";
import { newRepoCommand } from "./new-repo.command.js";

export const newCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "new",
	describe: "Create a repo, plugin, channel, server, secret, token, tunnel, GitHub App, project or spec",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(newRepoCommand as never)
			.command(pluginCreateCommand as never)
			.command(notificationsChannelAddCommand as never)
			.command(githubAppCreateCommand as never)
			.command(projectCreateCommand as never)
			.command(secretSetCommand as never)
			.command(notificationsCreateServerCommand as never)
			.command(ideasPromoteCommand as never)
			.command(authSetCommand as never)
			.command(tunnelUpCommand as never)
			.command(groupMenu("new") as never),
	handler: () => {},
};
