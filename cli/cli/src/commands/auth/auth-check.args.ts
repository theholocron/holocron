import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const authCheckArgs = (yy: Argv<GlobalArgs>) => yy.positional("provider", { type: "string" });

export type AuthCheckArgs = InferArgs<typeof authCheckArgs>;
