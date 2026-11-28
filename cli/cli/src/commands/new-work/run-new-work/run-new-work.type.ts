import type { CheckRow } from "@theholocron/kyber/ui";

import type { IssueEffort, PluginLoader } from "../../../plugin/index.js";
import type { PromoteIo } from "../../ideas-promote/run-ideas-promote/index.js";
import type { RunIssueCreateInput } from "../../issue-create/run-issue-create/index.js";

/** What {@link runNewWork} needs: everything `new issue` takes, plus the spec and the git config. */
export interface RunNewWorkInput extends Omit<RunIssueCreateInput, "loader" | "assignees"> {
	/** People to assign. Default: the person in git's config (see `gitAssignee()`); `me` is the token's user. */
	assignees?: string[];
	/** Also write the spec file stub, `.notes/<name>.spec.md`, from the new issue. */
	spec?: boolean;
	/** The whole spec name, without `.spec.md`; defaults to `tech-` and the title in kebab-case. */
	specName?: string;
	/** Defaults to a loader over the config's `issues` provider (and `projects` for `--project`). */
	loader?: PluginLoader;
	/** Answers one git config key; defaults to `git config --get` in the repo root. */
	gitConfig?: (key: string) => string | undefined;
	/** Disk access for the spec file; defaults to the real disk. */
	io?: PromoteIo;
	/** Asks which Effort the work is when none was given and a terminal can be asked. Defaults to a prompt. */
	askEffort?: () => Promise<IssueEffort | undefined>;
}

/** How a `new work` run went. */
export interface NewWorkReport {
	/** `fail` if a step failed, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** The rows of the run: the issue's, then the spec's. */
	rows: CheckRow[];
	/** The new issue's key in the tracker's syntax, when one was made. */
	key?: string;
	/** The spec's path relative to the repo root, when one was settled. */
	specPath?: string;
}
