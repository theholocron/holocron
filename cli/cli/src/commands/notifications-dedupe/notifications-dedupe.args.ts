import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const notificationsDedupeArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("channel", {
			type: "string",
			describe: "The forum to repair (default: the forum with `feeds.prs`)",
		})
		.option("provider", {
			type: "string",
			describe: "Which notifications provider, when several can de-duplicate posts",
		})
		.option("yes", {
			type: "boolean",
			describe: "Delete without asking (required without a terminal)",
		});

export type NotificationsDedupeArgs = InferArgs<typeof notificationsDedupeArgs>;
