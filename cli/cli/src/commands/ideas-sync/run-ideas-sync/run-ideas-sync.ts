/**
 * `holocron ideas sync` — files the idea notes that are ready.
 *
 * It reads every Markdown note in `ideas.dir` (not in a folder whose name starts with `_` or `.`). A note whose
 * `status:` is the filing state (default `in-progress`) and that has no `issue:` becomes an issue through the repo's
 * `issues` provider, and its `issue:` property is then written in the tracker's own syntax, which is what makes the
 * step run once. A note with embedded files is reported and skipped, since an issue body cannot carry them. It never
 * deletes anything, a note it cannot file is a failing row (the run goes on), and a write that went through is not
 * repeated. It writes, so it asks first unless `--dry-run` or `--yes` (without a terminal it refuses instead).
 */

import { join } from "node:path";

import { confirm } from "@inquirer/prompts";
import {
	type CheckRow,
	describeError,
	NonInteractiveError,
	printCheckRows,
	printCheckSummary,
	style,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { assertPluginsResolvable, PluginLoader } from "../../../plugin/index.js";
import type { ParsedNote } from "../ideas-sync.type.js";
import { listNotes } from "../list-notes/index.js";
import { parseNote } from "../parse-note/index.js";
import { realIdeasIo } from "../real-ideas-io/index.js";
import { resolveIdeasDir } from "../resolve-ideas-dir/index.js";
import { writeIssueKey } from "../write-issue-key/index.js";
import type { IdeasSyncReport, RunIdeasSyncInput } from "./run-ideas-sync.type.js";

/** The state that files a note when the config names none. */
const DEFAULT_FILING_STATE = "in-progress";

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

/** The issue's body: the note's text, then the line that traces the issue to its idea. */
const issueBody = (note: ParsedNote): string => `${note.body.trim()}\n\nFiled from idea: ${note.title}`;

export async function runIdeasSync(input: RunIdeasSyncInput): Promise<IdeasSyncReport> {
	/* v8 ignore next 2 -- the console and the real disk are only used outside tests, which inject both */
	const print = input.print ?? ((line: string) => console.log(line));
	const io = input.io ?? realIdeasIo();
	const dryRun = Boolean(input.context.dryRun);
	const finish = (rows: CheckRow[], status?: IdeasSyncReport["status"]): IdeasSyncReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: status ?? (summary.fail > 0 ? "fail" : "ok"), rows };
	};
	print(style.header(`Holocron ideas sync${dryRun ? " (dry-run)" : ""}`));
	print("");

	const ideas = input.loaded.resolved.ideas;
	const dir = resolveIdeasDir(ideas, io.home(), input.env);
	if (!dir) {
		return finish([
			row("ideas", "fail", "no notes folder: set `ideas.dir` in holocron.config or HOLOCRON_IDEAS_DIR"),
		]);
	}
	const paths = listNotes(io, dir);
	if (!paths) return finish([row(dir, "fail", "the notes folder does not exist or cannot be read")]);
	const fileState = ideas?.states?.file ?? DEFAULT_FILING_STATE;

	const rows: CheckRow[] = [];
	const ready: Array<{ path: string; note: ParsedNote }> = [];
	for (const path of paths) {
		const text = io.read(join(dir, path));
		if (text === undefined) {
			rows.push(row(path, "fail", "cannot be read"));
			continue;
		}
		const note = parseNote(text, path.slice(path.lastIndexOf("/") + 1));
		if (note.status !== fileState) {
			rows.push(row(path, "skip", note.status === "" ? "no status" : `status ${note.status}`));
		} else if (note.issue !== "") {
			rows.push(row(path, "skip", `already filed as ${note.issue}`));
		} else if (note.attachments.length > 0) {
			rows.push(
				row(
					path,
					"skip",
					`has embedded files an issue cannot carry (${note.attachments.join(", ")}); not filed`
				)
			);
		} else {
			ready.push({ path, note });
		}
	}

	if (ready.length === 0) return finish(rows);
	if (dryRun) {
		for (const { path, note } of ready) rows.push(row(path, "skip", `would file "${note.title}"`));
		return finish(rows.sort((a, b) => a.id.localeCompare(b.id)));
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`ideas sync\` creates ${ready.length} issue(s) and edits the notes; pass --yes to run it without asking, or --dry-run to preview`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`File ${ready.length} idea(s) as issues and record the issue in each note?`
		);
		if (!proceed) {
			print(`  ${style.skip("cancelled; nothing was changed")}`);
			return { status: "cancelled", rows: [] };
		}
	}

	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "ideas sync");
	const issues = loader.has("issues") ? loader.get("issues") : undefined;

	for (const { path, note } of ready) {
		if (!issues) {
			rows.push(row(path, "fail", "the config has no `issues` provider to file it with"));
			continue;
		}
		let key: string;
		try {
			({ key } = await issues.create({ summary: note.title, body: issueBody(note) }));
		} catch (err) {
			rows.push(row(path, "fail", `could not create the issue: ${describeError(err)}`));
			continue;
		}
		try {
			// Read again: a sync client may have changed the note while the issue was being made.
			const current = io.read(join(dir, path));
			if (current === undefined) throw new Error("the note can no longer be read");
			io.write(join(dir, path), writeIssueKey(current, key));
			rows.push(row(path, "ok", `filed as ${key}`));
		} catch (err) {
			rows.push({
				...row(path, "fail", `issue ${key} was created but \`issue:\` was not written: ${describeError(err)}`),
				problems: [`add \`issue: ${key}\` to the note by hand, or the next run files it again`],
			});
		}
	}
	return finish(rows.sort((a, b) => a.id.localeCompare(b.id)));
}
