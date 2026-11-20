import { describeError } from "@theholocron/kyber/ui";
import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import type { IssueClearable } from "../../plugin/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { readIssueBody } from "../issue-create/read-issue-body/index.js";
import {
	addIssueFieldOptions,
	type IssueFieldArgs,
	readIssueFieldArgs,
} from "../issue-fields/add-issue-field-options/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runIssueUpdate } from "./run-issue-update/index.js";

/** The words `--clear` takes, and the capability's field each one empties. */
export const CLEARABLE: Record<string, IssueClearable> = {
	assignee: "assignees",
	milestone: "milestone",
	parent: "parent",
	type: "kind",
	priority: "priority",
	effort: "effort",
	"start-date": "startDate",
	"target-date": "targetDate",
};

type Args = GlobalArgs &
	IssueFieldArgs & {
		key: string;
		title?: string;
		body?: string;
		bodyFile?: string;
		state?: "open" | "closed";
		addLabel?: string[];
		removeLabel?: string[];
		assignee?: string[];
		milestone?: string;
		unblock?: string[];
		clear?: string[];
		yes?: boolean;
	};

export const issueUpdateCommand: CommandModule<GlobalArgs, Args> = {
	command: "issue <key>",
	describe: "Change an issue in the repo's tracker: its fields, labels, links and state",
	builder: (y: Argv<GlobalArgs>) =>
		addIssueFieldOptions(y)
			.positional("key", {
				type: "string",
				demandOption: true,
				describe: "The issue: #12, 12, owner/repo#12 or ENG-42",
			})
			.option("title", { type: "string", describe: "A new title" })
			.option("body", { type: "string", describe: "A new text, replacing the old" })
			.option("body-file", {
				type: "string",
				describe: "Read the new text from a file (`-` for standard input)",
				conflicts: "body",
			})
			.option("state", {
				type: "string",
				choices: ["open", "closed"] as const,
				describe: "Open or close the issue",
			})
			.option("add-label", { type: "string", array: true, describe: "A label to add (repeatable)" })
			.option("remove-label", { type: "string", array: true, describe: "A label to remove (repeatable)" })
			.option("assignee", {
				type: "string",
				array: true,
				describe: "Who it is assigned to, replacing the current ones; `me` is you (repeatable)",
			})
			.option("milestone", { type: "string", describe: "The milestone: its number or its exact title" })
			.option("unblock", {
				type: "string",
				array: true,
				describe: "The key of a blocker to take off (repeatable)",
			})
			.option("clear", {
				type: "string",
				array: true,
				choices: Object.keys(CLEARABLE),
				describe: "A field to empty; nothing is cleared unless named (repeatable)",
			})
			.option("yes", { type: "boolean", describe: "Change it without asking (required without a terminal)" }),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		let body = argv.body;
		if (argv.bodyFile) {
			try {
				body = readIssueBody(argv.bodyFile, argv.cwd);
			} catch (err) {
				console.error(`Could not read ${argv.bodyFile}: ${describeError(err)}`);
				process.exitCode = 1;
				return;
			}
		}
		const report = await runIssueUpdate({
			key: String(argv.key),
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.title !== undefined ? { title: String(argv.title) } : {}),
			...(body !== undefined ? { body } : {}),
			...(argv.state ? { state: argv.state } : {}),
			...(argv.addLabel ? { addLabels: argv.addLabel.map(String) } : {}),
			...(argv.removeLabel ? { removeLabels: argv.removeLabel.map(String) } : {}),
			...(argv.assignee ? { assignees: argv.assignee.map(String) } : {}),
			...(argv.milestone ? { milestone: String(argv.milestone) } : {}),
			...(argv.unblock ? { unblock: argv.unblock.map(String) } : {}),
			...(argv.clear ? { clear: argv.clear.map((c) => CLEARABLE[String(c)]) } : {}),
			...readIssueFieldArgs(argv),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
