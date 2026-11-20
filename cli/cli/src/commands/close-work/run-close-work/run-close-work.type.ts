import type { RunGit } from "@theholocron/kyber/git";
import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { IssueUpdateReport, RunIssueUpdateInput } from "../../issue-update/run-issue-update/index.js";
import type { RunUpdateWorkInput, UpdateWorkReport } from "../../update-work/run-update-work/index.js";

/** What withdrawing a spec's discussion post came to. */
export interface WithdrawSpecsReport {
	/** Whether it worked (nothing failed). */
	ok: boolean;
	/** One line for the row: what was done, or why not. */
	detail: string;
}

/** What {@link runCloseWork} needs. */
export interface RunCloseWorkInput {
	/** The issue, as the tracker spells it: `#12`, `12`, `owner/repo#12`, `ENG-42`. */
	issue: string;
	/** Poll the aggregate check until it is green or red (`--wait`). Without it the aggregate is read once. */
	wait?: boolean;
	/** How long `wait` may poll, in minutes (`--timeout`). Default 30, the aggregate's own limit. */
	timeoutMinutes?: number;
	/** Close the pull request, withdraw the spec's post and remove the worktree and branch instead (`--abandon`). */
	abandon?: boolean;
	/** Leave the worktree, and so its branch, in place (`--keep-worktree`). */
	keepWorktree?: boolean;
	/** The pull request's number, when its branch is not named `<type>/<issue>-<slug>` (`--pr`). */
	pullRequest?: number;
	/** The repo's config. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` runs the reads and writes nothing, local git included. */
	context: RuntimeContext;
	/** Do not ask. Required without a terminal, except on a dry run. */
	yes?: boolean;
	/** Defaults to a loader over the config's `issues`, `source` and `projects` providers. */
	loader?: PluginLoader;
	/** Git. Defaults to the real one. */
	git?: RunGit;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
	/** The time in milliseconds. Defaults to `Date.now`. */
	now?: () => number;
	/** Waits that many milliseconds. Defaults to a timer. */
	sleep?: (ms: number) => Promise<void>;
	/** The pause between reads of the aggregate, in milliseconds. Default 30 seconds. */
	intervalMs?: number;
	/** `update work`, for the area labels; defaults to `runUpdateWork()`. */
	updateWork?: (input: RunUpdateWorkInput) => Promise<UpdateWorkReport>;
	/** `update issue`, for the relations and closing the issue; defaults to `runIssueUpdate()`. */
	updateIssue?: (input: RunIssueUpdateInput) => Promise<IssueUpdateReport>;
	/** `sync specs --withdraw --files <paths>`; defaults to `runSpecsSync()` over the config's notifications provider. */
	withdrawSpecs?: (files: string[]) => Promise<WithdrawSpecsReport>;
}

/** How a `close work` run went. */
export interface CloseWorkReport {
	/** `fail` if a row failed, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** The rows of the run. */
	rows: CheckRow[];
	/** The pull request the run found. */
	pullRequest?: { number: number; url: string; state: "open" | "merged" | "closed" };
}
