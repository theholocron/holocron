/**
 * `holocron list projects` — the owner's boards, newest first, with their number, name and state. Read-only, so
 * `--dry-run` changes nothing here.
 */

import { style } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../../observability/logger/index.js";
import { openProjects, type ProjectReport, type ProjectRunInput } from "../open-projects/index.js";
import { createProjectRows } from "../project-rows/index.js";

const COMMAND = "list projects";

export async function runProjectList(input: ProjectRunInput): Promise<ProjectReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const rows = createProjectRows(print, input.logger ?? getLogger());
	const { projects, options } = await openProjects(input, COMMAND);

	print(style.header(`Holocron list projects — ${options.owner}`));
	print("");
	try {
		const boards = (await projects.list(options.owner)).toSorted((a, b) => (b.number ?? 0) - (a.number ?? 0));
		if (boards.length === 0) {
			rows.skip("no boards", options.owner);
			return rows.finish(COMMAND);
		}
		const width = Math.max(1, ...boards.map((b) => String(b.number ?? "").length));
		print(style.dim(`  ${"#".padEnd(width)}  ${"Name".padEnd(32)}  State`));
		for (const b of boards) {
			print(`  ${String(b.number ?? "-").padEnd(width)}  ${b.name.padEnd(32)}  ${b.closed ? "closed" : "open"}`);
		}
		print("");
		rows.ok(`${boards.length} board${boards.length === 1 ? "" : "s"}`, options.owner);
	} catch (err) {
		rows.fail("list", errorMessage(err));
	}
	return rows.finish(COMMAND);
}
