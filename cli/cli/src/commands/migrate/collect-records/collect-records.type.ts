import type { IssueOrder, IssueRecord, IssueSelector } from "../../../plugin/index.js";
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
	openOnly?: boolean | undefined;
	/** Read at most this many issues (see `IssueSelector.limit`). */
	limit?: number | undefined;
	/** With `limit`, which end of the creation order; `oldest` when not given. */
	order?: IssueOrder | undefined;
}

/** The records that were read. */
export interface CollectedRecords {
	ok: true;
	/** What the source returned, oldest first when a limit was set. */
	records: IssueRecord[];
	/** Things worth saying about the read, such as items skipped. */
	notes: string[];
	/** The limit the read was held to, when one was set. */
	limit?: number;
	/** How many issues the selection matched before the limit cut it, when the provider knew. */
	matched?: number;
}

/** The records to migrate, or why there are none to read. */
export type Collected = CollectedRecords | { ok: false; reason: string };
