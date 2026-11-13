import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** What {@link runIssueCreate} needs. */
export interface RunIssueCreateInput {
	/** The issue's title (`Issues.create`'s `summary`). */
	title: string;
	/** The issue's text. */
	body?: string;
	/** Labels to put on the issue. */
	labels?: string[];
	/** The milestone: its number or its exact title. */
	milestone?: string;
	/** The repo's config: its `issues` provider. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` previews the issue and files nothing. */
	context: RuntimeContext;
	/** File without asking. */
	yes?: boolean;
	/** Defaults to a loader over the config's `issues` provider. */
	loader?: PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How a `new issue` run went. */
export interface IssueCreateReport {
	/** `fail` if a row failed, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** The row for the run. */
	rows: CheckRow[];
	/** The new issue's key in the tracker's syntax, when one was made. */
	key?: string;
}
