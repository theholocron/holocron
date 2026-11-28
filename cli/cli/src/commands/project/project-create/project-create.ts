/**
 * `holocron new project [template] [--title]` — make a board from a template (a built-in, or a file in the repo's
 * templates directory). Idempotent on the title: an open board that has it is not made again; a terminal is asked
 * whether to open the existing one, `--yes` prints its address, and anything else is a {@link NonInteractiveError}.
 */

import { NonInteractiveError, style } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../../observability/logger/index.js";
import { createFsTemplatesIo } from "../fs-templates-io/index.js";
import { loadTemplates } from "../load-templates/index.js";
import { openProjects } from "../open-projects/index.js";
import { createProjectRows } from "../project-rows/index.js";
import { terminalPrompt } from "../terminal-prompt/index.js";
import type { ProjectCreateReport, RunProjectCreateInput } from "./project-create.type.js";

const COMMAND = "new project";

export async function runProjectCreate(input: RunProjectCreateInput): Promise<ProjectCreateReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const rows = createProjectRows(print, input.logger ?? getLogger());
	const prompt = input.prompt ?? terminalPrompt();
	const dryRun = input.context.dryRun ?? false;
	const done = (extra: Omit<ProjectCreateReport, "status" | "summary" | "created"> & { created?: boolean } = {}) => ({
		...rows.finish(COMMAND),
		created: false,
		...extra,
	});

	const { projects, options } = await openProjects(input, COMMAND);
	const loaded = await loadTemplates(options.templatesDir, input.io ?? createFsTemplatesIo(input.context.repoRoot));
	print(style.header(`Holocron new project — ${options.owner}${dryRun ? " (dry-run)" : ""}`));
	print("");
	for (const problem of loaded.problems) rows.fail("template", problem);

	const names = Object.keys(loaded.templates).sort();
	let name = input.template;
	if (name === undefined) {
		if (!prompt.interactive) {
			throw new NonInteractiveError(
				`new project: name a template (${names.join(", ")}); there is no terminal to ask in`
			);
		}
		name = await prompt.select("Template:", names);
	}
	const template = loaded.templates[name];
	if (!template) {
		rows.fail(`template ${name}`, `unknown; available: ${names.join(", ")}`);
		return done();
	}
	const title = input.title ?? template.name;

	try {
		const existing = await projects.find(options.owner, title);
		if (existing) {
			const label = `board "${title}"${existing.number === undefined ? "" : ` (#${existing.number})`}`;
			if (input.yes) {
				rows.skip(`${label} already exists`, existing.url);
				return done({ board: existing });
			}
			if (!prompt.interactive) {
				throw new NonInteractiveError(
					`new project: ${label} already exists (${existing.url}); pass --yes to keep it, or another --title`
				);
			}
			const open = await prompt.confirm(`${label} already exists. Open it instead of creating another?`, true);
			rows.skip(open ? `${label} already exists` : `${label} kept, nothing created`, existing.url);
			return done({ board: existing });
		}

		if (dryRun) {
			rows.ok(`board "${title}"`, `would create from template ${template.name}`);
			return done();
		}
		const board = await projects.create(options.owner, title, template);
		rows.ok(`board "${title}"`, board.url);
		print("");
		print(`  Title:    ${title}`);
		print(`  Template: ${template.name}`);
		print(`  Fields:   ${["Status", ...template.fields.map((f) => f.name)].join(", ")}`);
		print(`  Views:    ${template.views.map((v) => `${v.name} (${v.layout})`).join(", ")}`);
		return done({ board, created: true });
	} catch (err) {
		if (err instanceof NonInteractiveError) throw err;
		rows.fail(`board "${title}"`, errorMessage(err));
		return done();
	}
}
