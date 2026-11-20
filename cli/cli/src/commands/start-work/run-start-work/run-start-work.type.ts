import type { RunGit } from "@theholocron/kyber/git";
import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { IssueEffort, IssueKind, PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** The git and file system {@link runStartWork} touches, so a test runs it with fakes and never a real repository. */
export interface StartWorkIo {
	/** Runs `git` with the arguments in a directory and returns its trimmed output; throws when git fails. */
	git: RunGit;
	/** Whether a file exists. */
	exists(path: string): boolean;
	/** Reads a text file. */
	read(path: string): string;
	/** Writes a text file, making its folder. */
	write(path: string, text: string): void;
	/** Today, `YYYY-MM-DD`. */
	today(): string;
}

/** What {@link runStartWork} needs; `holocron start work` and, later, `update work --start` both build it. */
export interface RunStartWorkInput {
	/** The issue, as the tracker spells it: `#12`, `12`, `owner/repo#12`, `ENG-42`. */
	issue: string;
	/** The branch and worktree name; kebab-case. Default: the issue's title in kebab-case. */
	name?: string;
	/** The pull request's title, a Conventional Commit line. Default: made from the issue (see `workTitle()`). */
	title?: string;
	/** The branch to start from and open the pull request against. Default `repo.defaultBranch`, else `alpha`. */
	base?: string;
	/** Make a worktree. Default `true`; `false` only makes the branch and switches to it. */
	worktree?: boolean;
	/** Where the worktree goes. Default `.claude/worktrees/<name>` under the repo root. */
	worktreePath?: string;
	/** The work's spec file (a path from the repo root or absolute); it is the first commit. */
	spec?: string;
	/** With a spec, one pull request for the spec and the code (the title is the implementation's). */
	onePr?: boolean;
	/** The issue's kind, deciding the commit type; read from the issue's title and labels when left out. */
	kind?: IssueKind;
	/** The issue's Effort, set with the start date; never chosen by the command. */
	effort?: IssueEffort;
	/** Assignee logins for the pull request, added to the issue's own. */
	assignees?: string[];
	/** A declared board to put the pull request on, by title. */
	project?: string;
	/** Make no pull request: the branch, the commit and the push only. */
	noPr?: boolean;
	/** The repo's config. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` runs the reads and writes nothing, local git included. */
	context: RuntimeContext;
	/** Start without asking. */
	yes?: boolean;
	/** Defaults to a loader over the config's `issues` and `source` providers. */
	loader?: PluginLoader;
	/** The git and file system. Defaults to the real ones. */
	io?: StartWorkIo;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How a `start work` run went. */
export interface StartWorkReport {
	/** `fail` if a row failed, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** The rows of the run. */
	rows: CheckRow[];
	/** The branch the work is on. */
	branch?: string;
	/** The directory the work is in: the worktree, or the repo root with `--no-worktree`. */
	directory?: string;
	/** The pull request title chosen. */
	title?: string;
	/** The pull request, when one was opened or found. */
	pullRequest?: { number: number; url: string; created: boolean };
}
