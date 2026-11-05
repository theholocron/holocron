import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const notificationsSetupArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("scope", {
			type: "string",
			describe: 'Webhook secret scope: "repo", "env=<name>" or "org=<name>" (default: the org)',
		})
		.option("provider", {
			type: "string",
			describe: "Which notifications provider, when several can provision",
		});

export type NotificationsSetupArgs = InferArgs<typeof notificationsSetupArgs>;
