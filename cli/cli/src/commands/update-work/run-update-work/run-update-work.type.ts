import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { IssueFieldInput } from "../../issue-fields/add-issue-field-options/index.js";
import type { IssueUpdateReport, RunIssueUpdateInput } from "../../issue-update/run-issue-update/index.js";
import type { ProjectStatusReport, RunProjectStatusInput } from "../../project/project-status/index.js";
import type { RunStartWorkInput, StartWorkReport } from "../../start-work/run-start-work/index.js";

/** What {@link runUpdateWork} needs: the issue field flags of `update issue`, the pull request's own, and the board's. */
export interface RunUpdateWorkInput extends IssueFieldInput {
	/** The issue, as the tracker spells it: `#12`, `12`, `owner/repo#12`, `ENG-42`. */
	issue: string;
	/** The pull request's new title, a Conventional Commit line (`--title`). */
	title?: string;
	/** The issue's new title (`--issue-title`). */
	issueTitle?: string;
	/** Labels to add to the issue and the pull request (`--label`). */
	addLabels?: string[];
	/** Labels to take off both (`--remove-label`). */
	removeLabels?: string[];
	/** The issue's assignees (replacing); the pull request gains them. */
	assignees?: string[];
	/** The milestone, by title or number; the pull request gets it by title. */
	milestone?: string;
	/** Keys of blockers to take off the issue. */
	unblock?: string[];
	/** The pull request's number, when its branch is not named `<type>/<issue>-<slug>`. */
	pullRequest?: number;
	/** Run `start work` first (the same function), so the work's branch and pull request exist. */
	start?: boolean;
	/** For `--start`: the branch and worktree name. */
	name?: string;
	/** For `--start`: the base branch. */
	base?: string;
	/** For `--start`: the spec file. */
	spec?: string;
	/** For `--start`: one pull request for the spec and the code. */
	onePr?: boolean;
	/** The board status to set by hand, last. In Review, Blocked and Done need `force`. */
	status?: string;
	/** Let `status` be one the board's automation owns; the value is temporary. */
	force?: boolean;
	/** The board, for `status`, when the config declares more than one. */
	board?: string;
	/** The repo's config. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` runs the reads and writes nothing. */
	context: RuntimeContext;
	/** Change it without asking. */
	yes?: boolean;
	/** Defaults to a loader over the config's `issues`, `source` and `projects` providers. */
	loader?: PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
	/** `start work`; defaults to `runStartWork()`. */
	startWork?: (input: RunStartWorkInput) => Promise<StartWorkReport>;
	/** `update issue`; defaults to `runIssueUpdate()`. */
	updateIssue?: (input: RunIssueUpdateInput) => Promise<IssueUpdateReport>;
	/** `project status`; defaults to `runProjectStatus()`. */
	setStatus?: (input: RunProjectStatusInput) => Promise<ProjectStatusReport>;
}

/** How an `update work` run went. */
export interface UpdateWorkReport {
	/** `fail` if a row failed, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** The rows of the run. */
	rows: CheckRow[];
	/** The pull request the run found or opened, when there was one. */
	pullRequest?: { number: number; url: string };
	/** The `area:<name>` labels the pull request's changed folders earn (all of them, not only the ones added). */
	areaLabels?: string[];
}
