import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { SyncArgs } from "../sync/sync.args.js";

export const syncReadmeArgs = (y: Argv<SyncArgs>) =>
	y.option("dry-run", {
		type: "boolean",
		describe: "Print what would change without writing",
		default: false,
	});

export type SyncReadmeArgs = InferArgs<typeof syncReadmeArgs>;
