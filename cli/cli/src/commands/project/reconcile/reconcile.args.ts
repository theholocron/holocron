import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../../cli-support/index.js";

export const projectReconcileArgs = (y: Argv<GlobalArgs>) =>
	y.positional("board", {
		type: "string",
		describe: "The declared board to reconcile, by name (every declared board when left out)",
	});

export type ProjectReconcileArgs = InferArgs<typeof projectReconcileArgs>;
