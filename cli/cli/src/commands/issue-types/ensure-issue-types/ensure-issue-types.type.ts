import type { CheckRow } from "@theholocron/kyber/ui";

import type { OrgIssueType } from "../../../config/index.js";
import type { Issues } from "../../../plugin/index.js";

/** What {@link ensureIssueTypes} needs. */
export interface EnsureIssueTypesInput {
	/** The Types the org area declares (`config.issueTypes`); none or an empty list is a `skip` row and no write. */
	declared: readonly OrgIssueType[] | undefined;
	/** The loaded `issues` provider, or `undefined` when none could be loaded. */
	issues: Issues | undefined;
	/** Why there is no `issues` provider, when that is so (a plugin that failed to load). */
	missingReason?: string;
	/**
	 * Who is asking. `apply` is a person who wanted it done: a refusal, an unreadable list and the limit are `fail` rows
	 * and no terminal without `yes` throws `NonInteractiveError`. `setup` is one step of many: the same cases are `skip`
	 * rows (a contributor without the permission still passes), and no terminal without `yes` is a `skip` row saying to
	 * pass `--yes`.
	 */
	caller: "apply" | "setup";
	/** Also set `description` and `color` on an existing Type that differs. Never `enabled`, never the name. */
	update: boolean;
	/** Write without asking. */
	yes?: boolean;
	/** Read and report only. */
	dryRun?: boolean;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
}

/** What {@link ensureIssueTypes} did. The caller prints `rows` (`printCheckRows`). */
export interface EnsureIssueTypesReport {
	/** `skip` when there was nothing it could do, `cancelled` when the answer was no. */
	status: "ok" | "fail" | "skip" | "cancelled";
	/** One row per declared Type, or the one row that says why nothing was done. */
	rows: CheckRow[];
	/** The names made, or on a dry run the names that would be. */
	created: string[];
	/** The names whose description or colour was set, or on a dry run would be. */
	updated: string[];
}
