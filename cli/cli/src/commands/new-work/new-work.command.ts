import { describeError } from "@theholocron/kyber/ui";
import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
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
import { runNewWork } from "./run-new-work/index.js";

type Args = GlobalArgs &
	IssueFieldArgs & {
		title: string;
		body?: string;
		bodyFile?: string;
		label?: string[];
		assignee?: string[];
		milestone?: string;
		spec?: string;
		yes?: boolean;
	};

export const newWorkCommand: CommandModule<GlobalArgs, Args> = {
	command: "work <title>",
	describe: "File an issue with every field and, with --spec, write its spec stub; start it with `start work`",
	builder: (y: Argv<GlobalArgs>) =>
		addIssueFieldOptions(y)
			.positional("title", { type: "string", demandOption: true, describe: "The work's title" })
			.option("body", { type: "string", describe: "The issue's text" })
			.option("body-file", {
				type: "string",
				describe: "Read the issue's text from a file (`-` for standard input)",
				conflicts: "body",
			})
			.option("label", { type: "string", array: true, describe: "A label to put on it (repeatable)" })
			.option("assignee", {
				type: "string",
				array: true,
				describe: "A person to assign, by login (default: the GitHub login in git's config; repeatable)",
			})
			.option("milestone", { type: "string", describe: "The milestone: its number or its exact title" })
			.option("spec", {
				type: "string",
				describe: "Also write .notes/<name>.spec.md from the issue; a name is optional (default: tech-<title>)",
			})
			.option("yes", { type: "boolean", describe: "File without asking (required without a terminal)" }),
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
		const report = await runNewWork({
			title: String(argv.title),
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(body ? { body } : {}),
			...(argv.assignee ? { assignees: argv.assignee.map(String) } : {}),
			...(argv.label ? { labels: argv.label.map(String) } : {}),
			...(argv.milestone ? { milestone: String(argv.milestone) } : {}),
			...(argv.spec !== undefined ? { spec: true } : {}),
			...(argv.spec ? { specName: String(argv.spec) } : {}),
			...readIssueFieldArgs(argv),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
