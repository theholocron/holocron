import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const specsSyncArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("provider", {
			type: "string",
			describe: "Which notifications provider, when several can keep discussion posts",
		})
		.option("channel", {
			type: "string",
			describe: "The forum channel the posts live in (default: the only forum the layout declares)",
		})
		.option("notify", {
			type: "boolean",
			default: false,
			describe: "Let a new post notify people (off by default, so a backfill pings no one)",
		});

export type SpecsSyncArgs = InferArgs<typeof specsSyncArgs>;
