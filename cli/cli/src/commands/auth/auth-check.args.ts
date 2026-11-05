import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const authCheckArgs = (yy: Argv<GlobalArgs>) => yy.positional("provider", { type: "string" });

export type AuthCheckArgs = InferArgs<typeof authCheckArgs>;
