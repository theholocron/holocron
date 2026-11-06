import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const notificationsLinkArgs = (y: Argv<GlobalArgs>) =>
	y.option("provider", {
		type: "string",
		describe: "Which notifications provider, when several can sign members in",
	});

export type NotificationsLinkArgs = InferArgs<typeof notificationsLinkArgs>;
