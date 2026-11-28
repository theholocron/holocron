/**
 * `holocron setup project` — make each board `providers.projects.boards` declares match its template: find it by name
 * among the open boards, make it from its template when it is missing, then `ensure()` it. What the provider cannot do
 * itself comes back as a `todo`, and every todo fails the run until a person has done it. A board that fails does not
 * stop the next one.
 */

import { style } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../../observability/logger/index.js";
import type { BoardSummary } from "../../../plugin/index.js";
import { createFsTemplatesIo } from "../fs-templates-io/index.js";
import { loadTemplates } from "../load-templates/index.js";
import { openProjects, type ProjectReport, type ProjectRunInput } from "../open-projects/index.js";
import { createProjectRows } from "../project-rows/index.js";

const COMMAND = "setup project";

export async function runProjectSetup(input: ProjectRunInput): Promise<ProjectReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const rows = createProjectRows(print, input.logger ?? getLogger());
	const dryRun = input.context.dryRun ?? false;

	const { projects, options } = await openProjects(input, COMMAND);
	print(style.header(`Holocron setup project — ${options.owner}${dryRun ? " (dry-run)" : ""}`));
	print("");

	if (options.boards.length === 0) {
		rows.skip("no boards", "declare them in providers.projects: boards: [{ template, name }]");
		return rows.finish(COMMAND);
	}

	const loaded = await loadTemplates(options.templatesDir, input.io ?? createFsTemplatesIo(input.context.repoRoot));
	for (const problem of loaded.problems) rows.fail("template", problem);

	for (const declared of options.boards) {
		const label = `board ${declared.name}`;
		const template = loaded.templates[declared.template];
		if (!template) {
			rows.fail(label, `template "${declared.template}" is not a built-in or a file in ${options.templatesDir}`);
			continue;
		}
		try {
			let board: BoardSummary | undefined = await projects.find(options.owner, declared.name);
			let created = false;
			if (!board) {
				if (dryRun) {
					rows.ok(label, `would create from template ${template.name}, then bring it in line`);
					continue;
				}
				board = await projects.create(options.owner, declared.name, template);
				created = true;
				rows.ok(label, `created from template ${template.name}: ${board.url}`);
			}

			if (!projects.ensure) {
				rows.skip(label, "the provider cannot compare a board with a template");
				continue;
			}
			if (dryRun) {
				rows.ok(label, `would bring ${board.url} in line with template ${template.name}`);
				continue;
			}
			const report = await projects.ensure(options.owner, board, template);
			for (const change of report.changes) rows.ok(`${label}: ${change}`);
			for (const todo of report.todos) rows.fail(`${label}: ${todo}`, "a person has to do this");
			if (report.changes.length === 0 && report.todos.length === 0) {
				rows.ok(label, created ? "matches its template" : "already matches its template");
			}
		} catch (err) {
			rows.fail(label, errorMessage(err));
		}
	}
	return rows.finish(COMMAND);
}
