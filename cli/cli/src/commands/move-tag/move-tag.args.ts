import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const moveTagArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("group", {
			type: "string",
			describe: "The version group whose major tag moves: a folder of the repo (ci)",
		})
		.positional("release", {
			type: "string",
			describe:
				"The stable release the major tag should point at (1.4.0). Default: the group's latest stable tag.",
		})
		.option("remote", {
			type: "string",
			default: "origin",
			describe: "The remote to push the moved tag to",
		});

export type MoveTagArgs = InferArgs<typeof moveTagArgs>;
