import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const authSetArgs = (yy: Argv<GlobalArgs>) =>
	yy.positional("provider", { type: "string" }).positional("value", { type: "string" });

export type AuthSetArgs = InferArgs<typeof authSetArgs>;
