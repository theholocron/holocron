/**
 * `holocron project status <issue> <status>` — set one item's status on a declared board by the issue's key, so nobody
 * looks up a project item id. The status is a name from the board's template (any case). Only the status changes, and
 * the item must already be on the board: it is never added here. It asks nothing (a status is easy to set back);
 * `--dry-run` prints the change and calls no mutator. Prints one line, `<key> <from> → <to>`.
 */

import { join } from "node:path";

import { style } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../../observability/logger/index.js";
import { createFsTemplatesIo } from "../fs-templates-io/index.js";
import { loadTemplates } from "../load-templates/index.js";
import { openProjects } from "../open-projects/index.js";
import { createProjectRows } from "../project-rows/index.js";
import type { ProjectStatusReport, RunProjectStatusInput } from "./project-status.type.js";

const COMMAND = "project status";

/** `#12`, `12`, `o/r#12` as a repository (or none) and a number; anything else (a Linear key) is undefined. */
const parseKey = (key: string): { repo: string | undefined; number: number } | undefined => {
	const m = /^(?:([^#\s]+)#|#)?(\d+)$/.exec(key.trim());
	return m ? { repo: m[1], number: Number(m[2]) } : undefined;
};

export async function runProjectStatus(input: RunProjectStatusInput): Promise<ProjectStatusReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const rows = createProjectRows(print, input.logger ?? getLogger());
	const dryRun = input.context.dryRun ?? false;
	const failed = (label: string, detail: string): ProjectStatusReport => {
		rows.fail(label, detail);
		return rows.finish(COMMAND);
	};

	const { projects, options } = await openProjects(input, COMMAND);
	if (!projects.items || !projects.setStatus) {
		return failed(COMMAND, `the \`${projects.providerName}\` provider cannot list items or set a status`);
	}
	const declared = input.board === undefined ? options.boards[0] : options.boards.find((b) => b.name === input.board);
	if (!declared) {
		return failed(
			input.board === undefined ? "no boards" : `board ${input.board}`,
			options.boards.length === 0
				? "declare them in providers.projects: boards: [{ template, name }]"
				: `not declared; declared boards: ${options.boards.map((b) => b.name).join(", ")}`
		);
	}

	try {
		const loaded = await loadTemplates(
			join(input.context.repoRoot, options.templatesDir),
			input.io ?? createFsTemplatesIo(input.context.repoRoot)
		);
		const template = loaded.templates[declared.template];
		if (!template) {
			return failed(`board ${declared.name}`, `there is no template named "${declared.template}"`);
		}
		const status = template.statuses.find((s) => s.name.toLowerCase() === input.status.trim().toLowerCase());
		if (!status) {
			return failed(
				`status ${input.status}`,
				`not in template ${template.name}; valid: ${template.statuses.map((s) => s.name).join(", ")}`
			);
		}
		const board = await projects.find(options.owner, declared.name);
		if (!board) {
			return failed(
				`board ${declared.name}`,
				"the board does not exist or is closed; run `holocron setup project`"
			);
		}

		const wanted = input.issue.trim();
		const parsed = parseKey(wanted);
		const own =
			`${input.loaded.resolved.org ?? input.context.org ?? ""}/${input.loaded.resolved.name}`.toLowerCase();
		const items = await projects.items(options.owner, board, template);
		const item = items.find((i) => {
			if (!parsed) return i.key.toLowerCase() === wanted.toLowerCase();
			const have = parseKey(i.key);
			if (have?.number !== parsed.number) return false;
			if (parsed.repo === undefined) return have.repo === undefined;
			return (have.repo ?? own).toLowerCase() === parsed.repo.toLowerCase();
		});
		if (!item) {
			return failed(
				`${wanted} on board ${declared.name}`,
				`not on the board; add it first (\`gh project item-add ${board.number ?? "<number>"} --owner ${options.owner} --url <issue url>\`, or turn on the board's auto-add rule)`
			);
		}

		const change = `${item.key} ${item.status ?? "no status"} → ${status.name}`;
		const done: ProjectStatusReport = {
			status: "ok",
			summary: { ok: 1, fail: 0, skip: 0 },
			key: item.key,
			...(item.status ? { from: item.status } : {}),
			to: status.name,
		};
		if (dryRun) {
			print(style.skip(`would set ${change}`));
			return done;
		}
		const result = await projects.setStatus(options.owner, board, item.key, status.name);
		if (result.status !== status.name) {
			return failed(item.key, `refused: still ${result.status}${result.via ? ` (${result.via})` : ""}`);
		}
		print(result.transitioned ? change : `${change} (already)`);
		return done;
	} catch (err) {
		return failed(COMMAND, errorMessage(err));
	}
}
