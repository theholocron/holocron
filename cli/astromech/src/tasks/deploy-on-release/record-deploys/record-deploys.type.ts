import type { Run } from "../../../utils/index.js";

/** The file the deploy phase leaves for the record phase: which packages deployed, and at which commit. */
export interface DeployRecordFile {
	/** The release commit the packages were deployed at. */
	to: string;
	/** The packages whose deploy succeeded, with the tag that records each. */
	deployed: { pkg: string; tag: string }[];
}

/** What `recordDeploys` needs. */
export interface RecordDeploysOptions {
	/** Repo root. */
	cwd: string;
	/** The file the deploy phase wrote (`--record-file`). */
	file: string;
	/** The token the tags are pushed with; never printed. */
	token: string | undefined;
	/** Where progress lines go. */
	print: (line: string) => void;
	/** Say what would be tagged without tagging. */
	dryRun?: boolean;
}

export interface RecordDeploysDeps {
	run?: Run;
	/** Reads the record file's text; `undefined` when there is no such file. */
	readFile?: (path: string) => string | undefined;
}

/** The outcome of recording the deploys: `fail` if a tag could not be written, `skip` when there was nothing to record. */
export interface RecordDeploysReport {
	status: "ok" | "fail" | "skip";
	results: { pkg: string; status: "ok" | "fail" | "dry-run"; message: string }[];
}
