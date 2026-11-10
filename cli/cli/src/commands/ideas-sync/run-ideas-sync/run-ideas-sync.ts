/**
 * `holocron ideas sync` — files the idea notes that are ready.
 *
 * It reads every idea through the `ideas` provider (`providers.ideas`, or `ideas.dir` read as an Obsidian vault; the
 * Obsidian plugin skips folders whose name starts with `_` or `.`). An idea whose status is the filing state (default
 * `in-progress`) and that has no issue becomes an issue through the repo's `issues` provider, and the issue is then
 * recorded with `Ideas.markFiled` (for Obsidian, an `issue:` property in the tracker's own syntax), which is what makes
 * the step run once. An idea with attachments is reported and skipped, since an issue body cannot carry them. Only
 * ideas to be filed, and ideas that need the person's attention, get a row; the rest are counted. The issue body ends
 * with a hidden `<!-- holocron:idea <key> -->` line, and an issue that carries it is reused instead of making a second
 * one (found with one `Issues.search({ text })` per note about to be filed, confirmed by the exact marker in the body;
 * GitHub searches its 2000 most recently updated issues, so an older one is still missed, and each search uses rate
 * limit). Two runs that overlap can both miss the marker and both create; each then searches once more after its
 * create (`convergeCreatedIssue()`), the older issue wins and the other run closes its own with a comment, so both
 * notes end with one key. It never deletes anything, and an idea it cannot file is a
 * failing row (the run goes on). It writes, so it asks first unless `--dry-run` or `--yes` (without a terminal it refuses instead).
 */

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

import { assertPluginsResolvable, type IdeaRecord, type Issue, PluginLoader } from "../../../plugin/index.js";
import { resolveIdeasProvider } from "../resolve-ideas-provider/index.js";
import { convergeCreatedIssue } from "./converge-created-issue/index.js";
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

/**
 * The hidden line that ties an issue to its note. A later run looks for it before it creates an issue, so a note whose
 * `issue:` could not be written is not filed twice.
 */
const marker = (key: string): string => `<!-- holocron:idea ${key} -->`;

/** The issue's body: the idea's text, the line that traces the issue to its idea, and the hidden marker. */
const issueBody = (idea: IdeaRecord): string =>
	`${idea.body.trim()}\n\nFiled from idea: ${idea.title}\n${marker(idea.key)}`;

/**
 * How many text matches are read back per note; the exact marker is then checked in each body. The search itself is
 * bounded by the provider: GitHub pages up to 2000 recent issues (20 pages of 100) and filters them client-side, so an
 * issue older than that is still missed, and each search spends rate limit. Linear filters on the server.
 */
const SEARCH_LIMIT = 20;

export async function runIdeasSync(input: RunIdeasSyncInput): Promise<IdeasSyncReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	let notReady = 0;
	const finish = (rows: CheckRow[], status?: IdeasSyncReport["status"]): IdeasSyncReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		if (notReady > 0) print(`  ${notReady} note(s) not ready (another status, or already filed), shown in no row`);
		return { status: status ?? (summary.fail > 0 ? "fail" : "ok"), rows };
	};
	print(style.header(`Holocron ideas sync${dryRun ? " (dry-run)" : ""}`));
	print("");

	const entry = resolveIdeasProvider(input.loaded.resolved, input.env);
	if (!entry) {
		return finish([
			row(
				"ideas",
				"fail",
				'no `ideas` provider: set `providers.ideas` (`["obsidian", { dir }]`) in holocron.config or HOLOCRON_IDEAS_DIR'
			),
		]);
	}
	// Reading needs only the `ideas` provider, so the `issues` one is not loaded (and needs no token) until there is
	// something to file.
	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const reader =
		input.ideasLoader ?? new PluginLoader({ ...input.loaded.resolved, providers: { ideas: entry } }, input.context);
	/* v8 ignore stop */
	await reader.load();
	assertPluginsResolvable(reader, "ideas sync");
	if (!reader.has("ideas")) {
		const failure = reader.loadFailures().find((f) => f.key === "ideas");
		return finish([
			row(
				"ideas",
				"fail",
				`the \`ideas\` provider is not available${failure ? ` (${describeError(failure.error)})` : ""}`
			),
		]);
	}
	const ideas = reader.get("ideas");
	let records: IdeaRecord[];
	try {
		records = await ideas.list();
	} catch (err) {
		return finish([row("ideas", "fail", describeError(err))]);
	}
	const fileState = input.loaded.resolved.ideas?.states?.file ?? DEFAULT_FILING_STATE;

	const rows: CheckRow[] = [];
	const ready: IdeaRecord[] = [];
	for (const idea of records) {
		if (idea.error !== undefined) {
			rows.push(row(idea.key, "fail", idea.error));
		} else if (idea.status !== fileState || idea.issue !== undefined) {
			notReady++;
		} else if (idea.attachments.length > 0) {
			rows.push(
				row(
					idea.key,
					"skip",
					`has embedded files an issue cannot carry (${idea.attachments.join(", ")}); not filed`
				)
			);
		} else {
			ready.push(idea);
		}
	}

	if (ready.length === 0) return finish(rows);
	if (dryRun) {
		for (const idea of ready) rows.push(row(idea.key, "skip", `would file "${idea.title}"`));
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

	for (const idea of ready) {
		const path = idea.key;
		if (!issues) {
			rows.push(row(path, "fail", "the config has no `issues` provider to file it with"));
			continue;
		}
		// One text search per note about to be filed (never for a note that is not a candidate). A text match may be
		// loose, so the issue's body must carry the exact marker. A search that throws stops only this note.
		let existing: Issue | undefined;
		try {
			const found = await issues.search({ text: marker(path), limit: SEARCH_LIMIT });
			existing = found.find((issue) => issue.body?.includes(marker(path)));
		} catch (err) {
			rows.push(
				row(path, "fail", `could not check for an existing issue, so none was created: ${describeError(err)}`)
			);
			continue;
		}
		let key: string;
		let detail = `already filed as ${existing?.key}`;
		let warning = false;
		if (existing) {
			key = existing.key;
		} else {
			let created: string;
			try {
				({ key: created } = await issues.create({ summary: idea.title, body: issueBody(idea) }));
			} catch (err) {
				rows.push(row(path, "fail", `could not create the issue: ${describeError(err)}`));
				continue;
			}
			// Another run may have created an issue for this note between our search and our create; settle on the
			// oldest one. This is the only extra search, and only for a note that was just created.
			({ key, detail, warning } = await convergeCreatedIssue(issues, marker(path), created));
		}
		try {
			// The provider reads the idea again first: a sync client may have changed it while the issue was being made.
			await ideas.markFiled(path, key);
			rows.push({
				...row(path, "ok", detail),
				problems: warning ? ["a duplicate issue for this idea may be open: close the extra one by hand"] : [],
			});
		} catch (err) {
			rows.push({
				...row(path, "fail", `issue ${key} was created but \`issue:\` was not written: ${describeError(err)}`),
				problems: [`add \`issue: ${key}\` to the note by hand`],
			});
		}
	}
	return finish(rows.sort((a, b) => a.id.localeCompare(b.id)));
}
