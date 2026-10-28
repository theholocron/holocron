import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const notificationsCreateServerArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("name", {
			type: "string",
			describe: "What the new server is called (not needed with --resume)",
		})
		.option("owner", {
			type: "string",
			demandOption: true,
			describe: "The member id (on the provider) who will own the server once they have joined",
		})
		.option("provider", {
			type: "string",
			describe: "Which notifications provider, when several can create a server",
		})
		.option("force", {
			type: "boolean",
			default: false,
			describe: "Create another server although the config already names one, and replace its id",
		})
		.option("resume", {
			type: "boolean",
			default: false,
			describe: "The server exists: skip creating and applying, and finish the hand-over",
		});

export type NotificationsCreateServerArgs = InferArgs<typeof notificationsCreateServerArgs>;
