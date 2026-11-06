import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const notificationsSyncRolesArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("provider", {
			type: "string",
			describe: "Which notifications provider, when several can manage roles",
		})
		.option("keep", {
			type: "boolean",
			default: false,
			describe: "Give the role to new team members but do not take it from people who left",
		});

export type NotificationsSyncRolesArgs = InferArgs<typeof notificationsSyncRolesArgs>;
