import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { IssueClearable, PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { IssueFieldInput } from "../../issue-fields/add-issue-field-options/index.js";

/** What {@link runIssueUpdate} needs. */
export interface RunIssueUpdateInput extends IssueFieldInput {
	/** The issue's key in the tracker (`#12`, `12`, `owner/repo#12`, `ENG-42`). */
	key: string;
	/** The new title. */
	title?: string;
	/** The new text, replacing the old. */
	body?: string;
	/** Open or close the issue. */
	state?: "open" | "closed";
	/** With `state: "closed"`: why, for a provider that records it (default `completed`). */
	stateReason?: "completed" | "not_planned";
	/** Labels to add. */
	addLabels?: string[];
	/** Labels to remove. */
	removeLabels?: string[];
	/** The people it is assigned to, replacing the current ones (`me` is the token's user). */
	assignees?: string[];
	/** The milestone: its number or its exact title. */
	milestone?: string;
	/** Keys of blockers to take off. */
	unblock?: string[];
	/** Fields to empty. */
	clear?: IssueClearable[];
	/** The repo's config: its `issues` provider. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` previews the change and writes nothing. */
	context: RuntimeContext;
	/** Change it without asking. */
	yes?: boolean;
	/** Defaults to a loader over the config's `issues` provider (and `projects` for `--project`). */
	loader?: PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How an `update issue` run went. */
export interface IssueUpdateReport {
	/** `fail` if a row failed, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** The rows for the run. */
	rows: CheckRow[];
	/** What the provider changed, one phrase each; empty when the issue was already as asked or nothing was written. */
	changed?: string[];
}
