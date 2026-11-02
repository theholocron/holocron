import type { Argv } from "yargs";

import type { GlobalArgs } from "../../cli-support/index.js";

export interface DoctorNotificationsArgs extends GlobalArgs {
	scope?: string;
	provider?: string;
	"built-only": boolean;
	deliver: boolean;
	post?: string;
}

export const doctorNotificationsArgs = (y: Argv<GlobalArgs>): Argv<DoctorNotificationsArgs> =>
	y
		.option("scope", {
			type: "string",
			describe: 'Where the layout\'s secrets live: "repo", "env=<name>" or "org=<name>" (default: the org)',
		})
		.option("provider", {
			type: "string",
			describe: "Which notifications provider, when several can inspect",
		})
		.option("built-only", {
			type: "boolean",
			default: false,
			describe: "Leave out the features that are not built yet (a routine drift check)",
		})
		.option("deliver", {
			type: "boolean",
			default: false,
			describe:
				"Post a test message through every channel's webhook, read it back and remove it (works with --built-only)",
		})
		.option("post", {
			type: "string",
			describe:
				"After the run, post the result to a channel as the bot: the failing steps, or only the summary when none failed (default channel: alerts)",
		});
