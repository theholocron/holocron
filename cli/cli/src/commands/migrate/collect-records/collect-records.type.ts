import type { IssueRecord, IssueSelector } from "../../../plugin/index.js";
import type { Side } from "../open-side/index.js";

/** What to migrate. */
export type MigrateScope =
	| { kind: "issue"; key: string }
	| { kind: "issues"; selector: IssueSelector }
	| { kind: "project"; name: string; owner: string };

/** What {@link collectRecords} needs. */
export interface CollectInput {
	/** The loaded source; a project scope needs its `projects` as well as its `issues`. */
	source: Extract<Side, { ok: true }>;
	/** What to read. */
	scope: MigrateScope;
	/** Leave closed issues behind. */
	openOnly?: boolean;
}

/** The records to migrate, or why there are none to read. */
export type Collected = { ok: true; records: IssueRecord[]; notes: string[] } | { ok: false; reason: string };
