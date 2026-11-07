import type { Argv } from "yargs";

import type { GlobalArgs } from "../../global-args/index.js";

/** The options every `migrate` subcommand shares: the two ends, closed issues, the milestone and the question. */
export const migrateOptions = (y: Argv<GlobalArgs>) =>
	y
		.option("from", {
			type: "string",
			demandOption: true,
			describe:
				"Where the issues are now: `provider` or `provider:key=value,...`, e.g. github or linear:team=ENG",
		})
		.option("to", {
			type: "string",
			demandOption: true,
			describe: "Where they go, in the same form",
		})
		.option("open-only", { type: "boolean", describe: "Leave closed issues behind" })
		.option("milestone", {
			type: "string",
			describe: "Put every migrated issue in this milestone (GitHub) or project (Linear); made if missing",
		})
		.option("yes", { type: "boolean", describe: "Migrate without asking" });
