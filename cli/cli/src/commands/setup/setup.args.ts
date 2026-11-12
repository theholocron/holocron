import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const setupArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("repo", {
			type: "string",
			global: false,
			describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
		})
		.option("hooks", {
			type: "boolean",
			global: false,
			describe:
				"Install git hooks (.husky/pre-push → holocron run ci). Default: on for protection:'strict'. --no-hooks to skip.",
		});

export type SetupArgs = InferArgs<typeof setupArgs>;
