/**
 * `holocron new work` — files an issue with every field and, when asked, writes the spec stub (spec
 * `tool-work-commands`). It is `new issue` plus `new spec`: the issue goes through {@link runIssueCreate} (so the
 * fields, the board, the confirmation and `--dry-run` are that command's) and the spec through
 * {@link runIdeasPromote}, written to the working tree only. It makes no branch and no commit: that is `start work`,
 * which the last line names, with the spec's path. The assignee defaults to the git config user, never the token's
 * identity; Effort is asked on a terminal when it was not given (the CLI never chooses it). The issue's key is printed
 * by the first row, before anything else is done, so a failed spec leaves the issue as the anchor to resume from.
 */

import { join } from "node:path";

import { select } from "@inquirer/prompts";
import { runGit } from "@theholocron/kyber/git";
import { type CheckRow, printCheckRows, style } from "@theholocron/kyber/ui";

import type { IssueEffort } from "../../../plugin/index.js";
import { realPromoteIo } from "../../ideas-promote/real-promote-io/index.js";
import { runIdeasPromote } from "../../ideas-promote/run-ideas-promote/index.js";
import { specName } from "../../ideas-promote/spec-name/index.js";
import { runIssueCreate } from "../../issue-create/run-issue-create/index.js";
import { gitAssignee } from "../git-assignee/index.js";
import type { NewWorkReport, RunNewWorkInput } from "./run-new-work.type.js";

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

/* v8 ignore start -- the prompt and the real git config are only used outside tests, which inject both */
const promptEffort = async (): Promise<IssueEffort | undefined> => {
	const answer = await select<IssueEffort | "none">({
		message: "Effort:",
		choices: [
			{ name: "high", value: "high" },
			{ name: "medium", value: "medium" },
			{ name: "low", value: "low" },
			{ name: "leave it unset", value: "none" },
		],
	});
	return answer === "none" ? undefined : answer;
};

const realGitConfig =
	(cwd: string) =>
	(key: string): string | undefined => {
		try {
			return runGit(["config", "--get", key], cwd) || undefined;
		} catch {
			return undefined;
		}
	};
/* v8 ignore stop */

export async function runNewWork(input: RunNewWorkInput): Promise<NewWorkReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	const root = input.context.repoRoot;
	const extra: CheckRow[] = [];
	const io = input.io ?? realPromoteIo;

	// The spec's name and path are settled before anything is filed, so a name that cannot be made, or a file that
	// is already there, stops the run while there is still nothing to clean up.
	let specPath: string | undefined;
	if (input.spec) {
		const name = specName(input.title, input.specName);
		if (!name) {
			const detail =
				input.specName === undefined
					? "no spec name can be made from the title; pass --spec <name>"
					: `"${input.specName}" is not a spec name: use lower-case words joined by hyphens, such as tech-my-topic`;
			const rows = [row("spec", "fail", detail)];
			printCheckRows(rows, print);
			return { status: "fail", rows };
		}
		specPath = join(".notes", `${name}.spec.md`);
		if (io.exists(join(root, specPath))) {
			const rows = [row(specPath, "fail", "the spec already exists; it is never overwritten")];
			printCheckRows(rows, print);
			return { status: "fail", rows, specPath };
		}
	}

	const assignees =
		input.assignees && input.assignees.length > 0
			? input.assignees
			: [gitAssignee(input.gitConfig ?? realGitConfig(root))].filter((a): a is string => Boolean(a));
	if (!input.assignees?.length && assignees.length === 0) {
		extra.push(
			row(
				"assignee",
				"skip",
				"git config has no GitHub login (`github.user`); pass --assignee to assign the issue"
			)
		);
	}

	let effort = input.effort;
	const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
	if (!effort && !input.yes && !dryRun && interactive) effort = await (input.askEffort ?? promptEffort)();

	const created = await runIssueCreate({
		...input,
		...(assignees.length > 0 ? { assignees } : {}),
		...(effort ? { effort } : {}),
	});
	if (created.status === "cancelled") return { status: "cancelled", rows: [] };
	printCheckRows(extra, print);
	const rows = [...created.rows, ...extra];
	if (created.status === "fail") return { status: "fail", rows, ...(created.key ? { key: created.key } : {}) };

	if (!input.spec || !specPath) {
		if (created.key) print(`  ${style.skip(`next: holocron start work ${created.key}`)}`);
		return { status: "ok", rows, ...(created.key ? { key: created.key } : {}) };
	}

	if (dryRun || !created.key) {
		print(`  ${style.skip(`would write ${specPath} from the new issue; nothing is written on a dry run`)}`);
		return { status: "ok", rows, specPath };
	}

	const spec = await runIdeasPromote({
		issue: created.key,
		...(input.specName ? { name: input.specName } : {}),
		loaded: input.loaded,
		context: input.context,
		// The person agreed to `new work` already (or passed --yes), so the spec is not a second question.
		yes: true,
		...(input.loader ? { loader: input.loader } : {}),
		io,
		print,
	});
	const path = spec.path ?? specPath;
	const status = spec.status === "ok" ? "ok" : "fail";
	if (status === "ok") {
		print(
			`  ${style.skip(`next: holocron start work ${created.key} --spec ${path} (the spec is written, not committed)`)}`
		);
	} else {
		print(
			`  ${style.skip(`the issue ${created.key} exists; fix the spec and run \`holocron new spec ${created.key}\``)}`
		);
	}
	return { status, rows: [...rows, ...spec.rows], key: created.key, specPath: path };
}
