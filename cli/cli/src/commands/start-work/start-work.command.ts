import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import type { IssueEffort, IssueKind } from "../../plugin/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runStartWork } from "./run-start-work/index.js";

type Args = GlobalArgs & {
	issue: string;
	name?: string;
	title?: string;
	base?: string;
	worktree?: boolean;
	worktreePath?: string;
	spec?: string;
	onePr?: boolean;
	type?: IssueKind;
	effort?: IssueEffort;
	assignee?: string[];
	project?: string;
	pr?: boolean;
	yes?: boolean;
};

export const startWorkCommand: CommandModule<GlobalArgs, Args> = {
	command: "work <issue>",
	describe: "Start work on an issue: branch, worktree, first commit, push and a draft pull request",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.positional("issue", {
				type: "string",
				demandOption: true,
				describe: "The issue: #1234, 1234, owner/repo#1234 or the tracker's own key",
			})
			.option("name", {
				type: "string",
				describe: "The branch and worktree name, kebab-case (default: from the title)",
			})
			.option("title", {
				type: "string",
				describe: "The pull request's title, a Conventional Commit line (default: made from the issue)",
			})
			.option("base", {
				type: "string",
				describe: "The branch to start from and merge into (default: repo.defaultBranch)",
			})
			.option("worktree", {
				type: "boolean",
				default: true,
				describe:
					"Make a worktree under .claude/worktrees; --no-worktree only makes the branch and switches to it",
			})
			.option("worktree-path", {
				type: "string",
				describe: "Where the worktree goes (default: .claude/worktrees/<name>)",
			})
			.option("spec", {
				type: "string",
				describe: "The work's spec file; it is the first commit, and the pull request carries only the spec",
			})
			.option("one-pr", {
				type: "boolean",
				describe: "With --spec: one pull request for the spec and the code, titled like the code",
			})
			.option("type", {
				type: "string",
				choices: ["bug", "feature", "task"] as const,
				describe: "The issue's kind, deciding the commit type (default: its title and labels)",
			})
			.option("effort", {
				type: "string",
				choices: ["high", "medium", "low"] as const,
				describe: "Set the issue's Effort with its start date",
			})
			.option("assignee", {
				type: "string",
				array: true,
				describe: "A login to assign the pull request to, besides the issue's (repeatable)",
			})
			.option("project", { type: "string", describe: "Put the pull request on this board, by title" })
			.option("pr", {
				type: "boolean",
				default: true,
				describe: "Open the pull request; --no-pr stops after the push",
			})
			.option("yes", { type: "boolean", describe: "Start without asking (required without a terminal)" }),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runStartWork({
			issue: String(argv.issue),
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.name ? { name: argv.name } : {}),
			...(argv.title ? { title: argv.title } : {}),
			...(argv.base ? { base: argv.base } : {}),
			...(argv.worktree === false ? { worktree: false } : {}),
			...(argv.worktreePath ? { worktreePath: argv.worktreePath } : {}),
			...(argv.spec ? { spec: argv.spec } : {}),
			...(argv.onePr ? { onePr: true } : {}),
			...(argv.type ? { kind: argv.type } : {}),
			...(argv.effort ? { effort: argv.effort } : {}),
			...(argv.assignee ? { assignees: argv.assignee.map(String) } : {}),
			...(argv.project ? { project: argv.project } : {}),
			...(argv.pr === false ? { noPr: true } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
