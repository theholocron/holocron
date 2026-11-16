import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** What {@link runUploadCoverage} needs. */
export interface RunUploadCoverageInput {
	/** The repo's config: its `coverage` provider. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` lists what would be uploaded and uploads nothing. */
	context: RuntimeContext;
	/** The `--uploads` text: a JSON list of `{ flag, files }`. */
	uploads: string;
	/** Let a run with no coverage file in any group finish quietly. */
	allowEmpty?: boolean;
	/** Loads the `coverage` provider alone. Defaults to a loader over the config's `coverage` entry. */
	loader?: PluginLoader;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How an `upload coverage` run went. */
export interface UploadCoverageReport {
	/** `fail` if a row failed, otherwise `ok`. */
	status: "fail" | "ok";
	/** One row per flag reached, plus one for the run when it could not start or did not succeed as a whole. */
	rows: CheckRow[];
	/** How many flags were uploaded. */
	uploaded: number;
}
