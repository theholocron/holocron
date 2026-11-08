import type { Argv, CommandModule } from "yargs";

import { ConfigError } from "../../../config/index.js";
import type { GlobalArgs } from "../../global-args/index.js";
import { limitOptions } from "../limit-options/index.js";
import { handleMigrate, type MigrateArgs } from "../migrate-handler/index.js";
import { migrateOptions } from "../migrate-options/index.js";

type Args = MigrateArgs & { all?: boolean; source?: string; keys?: string };

export const migrateIssuesCommand: CommandModule<GlobalArgs, Args> = {
	command: "issues",
	describe: "Move several issues: every issue (--all), the issues of a milestone or project, or a list of keys",
	builder: (y: Argv<GlobalArgs>) =>
		limitOptions(migrateOptions(y))
			.option("all", { type: "boolean", describe: "Every issue the source is configured for" })
			.option("source-milestone", {
				type: "string",
				describe: "Every issue of this milestone (GitHub) or project (Linear) in the source",
			})
			.option("keys", { type: "string", describe: "Comma-separated keys, e.g. #1,#2,#3" }) as never,
	handler: (argv) => {
		const a = argv as Args & { sourceMilestone?: string };
		const chosen = [a.all, a.sourceMilestone, a.keys].filter(Boolean).length;
		if (chosen !== 1)
			throw new ConfigError("migrate issues: pass exactly one of --all, --source-milestone or --keys");
		return handleMigrate(a, () => ({
			kind: "issues",
			selector: a.all
				? { all: true }
				: a.sourceMilestone
					? { milestone: a.sourceMilestone }
					: {
							keys: a
								.keys!.split(",")
								.map((k) => k.trim())
								.filter(Boolean),
						},
		}));
	},
};
