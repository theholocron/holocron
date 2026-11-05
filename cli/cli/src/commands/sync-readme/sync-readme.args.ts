import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { RepoSyncArgs } from "../repo/repo-sync.args.js";

export const syncReadmeArgs = (y: Argv<RepoSyncArgs>) =>
	y.option("dry-run", {
		type: "boolean",
		describe: "Print what would change without writing",
		default: false,
	});

export type SyncReadmeArgs = InferArgs<typeof syncReadmeArgs>;
