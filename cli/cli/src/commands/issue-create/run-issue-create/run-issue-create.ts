/**
 * `holocron new issue` — files an issue through the repo's `issues` provider.
 *
 * The provider's `create` makes the issue (GitHub or Linear, whatever the config names), so the command knows nothing
 * of a tracker. It writes to a tracker, so it asks first unless `--dry-run` or `--yes` (without a terminal it refuses
 * instead). It does not look for a duplicate: filing the same title twice makes two issues.
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

import { assertPluginsResolvable, PluginLoader } from "../../../plugin/index.js";
import type { IssueCreateReport, RunIssueCreateInput } from "./run-issue-create.type.js";

/** How many lines of the body a dry run shows. */
const PREVIEW_LINES = 8;

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

export async function runIssueCreate(input: RunIssueCreateInput): Promise<IssueCreateReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	const finish = (rows: CheckRow[], key?: string): IssueCreateReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: summary.fail > 0 ? "fail" : "ok", rows, ...(key ? { key } : {}) };
	};
	print(style.header(`Holocron new issue${dryRun ? " (dry-run)" : ""}`));
	print("");

	const title = input.title.trim();
	if (!title) return finish([row("title", "fail", "the title is empty")]);

	const entry = input.loaded.resolved.providers.issues;
	if (!entry) return finish([row(title, "fail", "the config has no `issues` provider to file the issue with")]);
	const credentials = input.loaded.resolved.providers.credentials;
	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const loader =
		input.loader ??
		new PluginLoader(
			{ ...input.loaded.resolved, providers: { issues: entry, ...(credentials ? { credentials } : {}) } },
			input.context
		);
	/* v8 ignore stop */
	await loader.load();
	assertPluginsResolvable(loader, "new issue");
	if (!loader.has("issues")) {
		const failure = loader.loadFailures().find((f) => f.key === "issues");
		return finish([
			row(
				title,
				"fail",
				`the \`issues\` provider is not available${failure ? ` (${describeError(failure.error)})` : ""}`
			),
		]);
	}

	const labels = [...new Set((input.labels ?? []).map((l) => l.trim()).filter(Boolean))];
	const body = input.body?.trim() ? input.body : undefined;
	const milestone = input.milestone?.trim() ? input.milestone.trim() : undefined;
	const details = [
		labels.length > 0 ? `labels: ${labels.join(", ")}` : undefined,
		milestone ? `milestone: ${milestone}` : undefined,
	].filter(Boolean);
	const summary = details.length > 0 ? ` (${details.join("; ")})` : "";

	if (dryRun) {
		print(`  ${title}`);
		for (const line of (body ?? "").split("\n").slice(0, PREVIEW_LINES)) print(`    ${style.skip(line)}`);
		print("");
		return finish([row(title, "skip", `would file the issue${summary}`)]);
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				"`new issue` files an issue; pass --yes to run it without asking, or --dry-run to preview"
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`File "${title}"${summary}?`
		);
		if (!proceed) {
			print(`  ${style.skip("cancelled; nothing was filed")}`);
			return { status: "cancelled", rows: [] };
		}
	}

	try {
		const { key } = await loader.get("issues").create({
			summary: title,
			...(body ? { body } : {}),
			...(labels.length > 0 ? { labels } : {}),
			...(milestone ? { milestone } : {}),
		});
		return finish([row(title, "ok", `filed ${key}`)], key);
	} catch (err) {
		return finish([row(title, "fail", `could not file the issue: ${describeError(err)}`)]);
	}
}
