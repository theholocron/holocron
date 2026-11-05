/**
 * `holocron project close <number-or-name> [--yes]` — close an open board. Reversible (the provider can reopen it).
 * Asks first in a terminal; without one it needs `--yes` and is a {@link NonInteractiveError} otherwise.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../../observability/logger/index.js";
import { NonInteractiveError, style } from "../../../ui/index.js";
import { openProjects } from "../open-projects/index.js";
import { createProjectRows } from "../project-rows/index.js";
import { terminalPrompt } from "../terminal-prompt/index.js";
import type { ProjectCloseReport, RunProjectCloseInput } from "./project-close.type.js";

const COMMAND = "project close";

export async function runProjectClose(input: RunProjectCloseInput): Promise<ProjectCloseReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const rows = createProjectRows(print, input.logger ?? getLogger());
	const prompt = input.prompt ?? terminalPrompt();
	const dryRun = input.context.dryRun ?? false;
	const done = (closed: boolean): ProjectCloseReport => ({ ...rows.finish(COMMAND), closed });

	const { projects, options } = await openProjects(input, COMMAND);
	print(style.header(`Holocron project close — ${options.owner}${dryRun ? " (dry-run)" : ""}`));
	print("");

	try {
		const wanted = input.board.trim();
		const open = (await projects.list(options.owner)).filter((b) => !b.closed);
		const board = /^\d+$/.test(wanted)
			? open.find((b) => b.number === Number(wanted))
			: open.find((b) => b.name === wanted);
		if (!board) {
			rows.fail(`board ${wanted}`, "no open board with that number or name");
			return done(false);
		}
		const label = `board ${board.number === undefined ? "" : `#${board.number} `}"${board.name}"`;

		if (dryRun) {
			rows.ok(label, "would close");
			return done(false);
		}
		if (!input.yes) {
			if (!prompt.interactive) {
				throw new NonInteractiveError(`project close: closing ${label} needs a confirmation; pass --yes`);
			}
			if (!(await prompt.confirm(`Close ${label}?`, false))) {
				rows.skip(label, "kept open");
				return done(false);
			}
		}
		await projects.close(options.owner, board);
		rows.ok(label, "closed");
		return done(true);
	} catch (err) {
		if (err instanceof NonInteractiveError) throw err;
		rows.fail("close", errorMessage(err));
		return done(false);
	}
}
