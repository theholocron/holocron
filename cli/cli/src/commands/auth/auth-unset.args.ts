import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const authUnsetArgs = (yy: Argv<GlobalArgs>) => yy.positional("provider", { type: "string" });

export type AuthUnsetArgs = InferArgs<typeof authUnsetArgs>;
