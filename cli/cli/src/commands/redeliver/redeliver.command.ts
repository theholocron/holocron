import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { redeliverWebhooksCommand } from "../redeliver-webhooks/index.js";

export const redeliverCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "redeliver",
	describe: "Deliver again what a GitHub App's endpoint did not accept",
	builder: (y: Argv<GlobalArgs>) =>
		y.command(redeliverWebhooksCommand as never).command(groupMenu("redeliver") as never),
	handler: () => {},
};
