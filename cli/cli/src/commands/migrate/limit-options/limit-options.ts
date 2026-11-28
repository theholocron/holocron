import type { Argv } from "yargs";

import type { GlobalArgs } from "../../global-args/index.js";

/**
 * The options that cap how many issues are read from the source: `--limit` and `--order`. Shared by `migrate issues`,
 * `migrate project` and `sync issues`; `migrate issue` names one issue and has neither.
 */
export const limitOptions = (y: Argv<GlobalArgs>) =>
	y
		.option("limit", {
			type: "string",
			describe: "Read at most this many issues from the source (a positive whole number), for a trial run",
		})
		.option("order", {
			type: "string",
			choices: ["oldest", "newest"],
			default: "oldest",
			describe: "With --limit, which end of the creation order to read: the first created or the last created",
		});
