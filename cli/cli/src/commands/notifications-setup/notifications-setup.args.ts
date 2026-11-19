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
		})
		.option("replace", {
			type: "boolean",
			describe:
				"Make the server emoji the layout gives an image again, even when the server has them (new ids; reactions made with the old ones are lost)",
		})
		.option("yes", {
			type: "boolean",
			describe: "Replace emoji without asking (required with --replace and no terminal)",
		});

export type NotificationsSetupArgs = InferArgs<typeof notificationsSetupArgs>;
