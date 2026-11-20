import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import {
	addIssueFieldOptions,
	type IssueFieldArgs,
	readIssueFieldArgs,
} from "../issue-fields/add-issue-field-options/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runUpdateWork } from "./run-update-work/index.js";

type Args = GlobalArgs &
	IssueFieldArgs & {
		issue: string;
		title?: string;
		issueTitle?: string;
		label?: string[];
		removeLabel?: string[];
		assignee?: string[];
		milestone?: string;
		unblock?: string[];
		pr?: number;
		start?: boolean;
		name?: string;
		base?: string;
		spec?: string;
		onePr?: boolean;
		status?: string;
		force?: boolean;
		board?: string;
		yes?: boolean;
	};

export const updateWorkCommand: CommandModule<GlobalArgs, Args> = {
	command: "work <issue>",
	describe: "Keep an issue, its pull request and the board in step: fields, labels, area labels and status",
	builder: (y: Argv<GlobalArgs>) =>
		addIssueFieldOptions(y)
			.positional("issue", {
				type: "string",
				demandOption: true,
				describe: "The issue: #1234, 1234, owner/repo#1234 or the tracker's own key",
			})
			.option("title", { type: "string", describe: "The pull request's new title, a Conventional Commit line" })
			.option("issue-title", { type: "string", describe: "The issue's new title" })
			.option("label", {
				type: "string",
				array: true,
				describe: "A label to add to the issue and the pull request",
			})
			.option("remove-label", {
				type: "string",
				array: true,
				describe: "A label to take off the issue and the pull request",
			})
			.option("assignee", {
				type: "string",
				array: true,
				describe: "Who the issue is assigned to, replacing the current ones; the pull request gains them",
			})
			.option("milestone", { type: "string", describe: "The milestone: its number or its exact title" })
			.option("unblock", { type: "string", array: true, describe: "The key of a blocker to take off the issue" })
			.option("pr", {
				type: "number",
				describe: "The pull request's number, when its branch is not <type>/<issue>-<slug>",
			})
			.option("start", {
				type: "boolean",
				describe: "Run `start work` first: branch, worktree, first commit, push and a draft pull request",
			})
			.option("name", { type: "string", describe: "With --start: the branch and worktree name" })
			.option("base", { type: "string", describe: "With --start: the branch to start from and merge into" })
			.option("spec", { type: "string", describe: "With --start: the work's spec file, the first commit" })
			.option("one-pr", {
				type: "boolean",
				describe: "With --start and --spec: one pull request for the spec and the code",
			})
			.option("status", {
				type: "string",
				describe:
					"Set the board status by hand, last; temporary, the board's rules overwrite it. In Review, Blocked and Done need --force",
			})
			.option("force", {
				type: "boolean",
				describe:
					"Allow --status In Review, Blocked or Done, which the board's automation owns (use only while it is down)",
			})
			.option("board", {
				type: "string",
				describe: "For --status: the declared board's name (default: the first)",
			})
			.option("yes", { type: "boolean", describe: "Change it without asking (required without a terminal)" }),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runUpdateWork({
			issue: String(argv.issue),
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.title !== undefined ? { title: String(argv.title) } : {}),
			...(argv.issueTitle !== undefined ? { issueTitle: String(argv.issueTitle) } : {}),
			...(argv.label ? { addLabels: argv.label.map(String) } : {}),
			...(argv.removeLabel ? { removeLabels: argv.removeLabel.map(String) } : {}),
			...(argv.assignee ? { assignees: argv.assignee.map(String) } : {}),
			...(argv.milestone ? { milestone: String(argv.milestone) } : {}),
			...(argv.unblock ? { unblock: argv.unblock.map(String) } : {}),
			...(argv.pr !== undefined ? { pullRequest: Number(argv.pr) } : {}),
			...(argv.start ? { start: true } : {}),
			...(argv.name ? { name: argv.name } : {}),
			...(argv.base ? { base: argv.base } : {}),
			...(argv.spec ? { spec: argv.spec } : {}),
			...(argv.onePr ? { onePr: true } : {}),
			...(argv.status !== undefined ? { status: String(argv.status) } : {}),
			...(argv.force ? { force: true } : {}),
			...(argv.board ? { board: argv.board } : {}),
			...readIssueFieldArgs(argv),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
