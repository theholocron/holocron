/**
 * `holocron new spec` — turns a filed idea into a draft spec.
 *
 * It reads the issue through the repo's `issues` provider (`Issues.get`, which parses the key in the tracker's own
 * syntax) and writes `.notes/<name>.spec.md`: draft frontmatter with the `issue:`, the title, and a `Problem` section
 * with the issue's text, less the `Filed from idea:` line and the hidden marker `sync ideas` added. It writes no `id`
 * (`sync specs` numbers the spec once it is on the default branch). It refuses to overwrite a file, and it never edits
 * or closes the issue and never touches the vault, whose note was trashed when the idea was filed. Any issue can be
 * promoted; the row says whether it carried the idea marker. It writes, so it asks first unless `--dry-run` or
 * `--yes` (without a terminal it refuses instead).
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

import { assertPluginsResolvable, type Issue, PluginLoader } from "../../../plugin/index.js";
import { buildSpec } from "../build-spec/index.js";
import { realPromoteIo } from "../real-promote-io/index.js";
import { specName } from "../spec-name/index.js";
import type { IdeasPromoteReport, RunIdeasPromoteInput } from "./run-ideas-promote.type.js";

/** How many lines of the spec a dry run shows. */
const PREVIEW_LINES = 12;

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

/** `https://github.com/o/r/issues/12` as `o/r#12`; `undefined` for any other address. */
const githubRef = (url: string | undefined): string | undefined => {
	const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/(\d+)/.exec(url ?? "");
	return match ? `${match[1]}#${match[2]}` : undefined;
};

export async function runIdeasPromote(input: RunIdeasPromoteInput): Promise<IdeasPromoteReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	const io = input.io ?? realPromoteIo;
	const finish = (rows: CheckRow[], path?: string): IdeasPromoteReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: summary.fail > 0 ? "fail" : "ok", rows, ...(path ? { path } : {}) };
	};
	print(style.header(`Holocron new spec${dryRun ? " (dry-run)" : ""}`));
	print("");

	const entry = input.loaded.resolved.providers.issues;
	if (!entry) return finish([row(input.issue, "fail", "the config has no `issues` provider to read the issue with")]);
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
	assertPluginsResolvable(loader, "new spec");
	if (!loader.has("issues")) {
		const failure = loader.loadFailures().find((f) => f.key === "issues");
		return finish([
			row(
				input.issue,
				"fail",
				`the \`issues\` provider is not available${failure ? ` (${describeError(failure.error)})` : ""}`
			),
		]);
	}

	let issue: Issue;
	try {
		issue = await loader.get("issues").get(input.issue);
	} catch (err) {
		return finish([row(input.issue, "fail", `could not read the issue: ${describeError(err)}`)]);
	}

	const name = specName(issue.summary, input.name);
	if (!name) {
		return finish([
			row(
				issue.key,
				"fail",
				input.name === undefined
					? "no spec name can be made from the title; pass --name"
					: `"${input.name}" is not a spec name: use lower-case words joined by hyphens, such as tech-my-topic`
			),
		]);
	}
	const relative = join(".notes", `${name}.spec.md`);
	if (io.exists(join(input.context.repoRoot, relative))) {
		return finish([row(relative, "fail", "the spec already exists; it is never overwritten")], relative);
	}

	const { org, name: repoName } = input.loaded.resolved;
	const ref = githubRef(issue.url) ?? (issue.key.startsWith("#") ? `${org}/${repoName}${issue.key}` : issue.key);
	const { content, fromIdea } = buildSpec({ title: issue.summary, body: issue.body, issue: ref });
	const origin = fromIdea
		? `from ${issue.key}, which carries the idea marker`
		: `from ${issue.key}, which has no \`Filed from idea:\` marker (its text is used as it is)`;

	if (dryRun) {
		print(`  ${relative}`);
		for (const line of content.split("\n").slice(0, PREVIEW_LINES)) print(`    ${style.skip(line)}`);
		print("");
		return finish([row(relative, "skip", `would write the spec ${origin}`)], relative);
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`new spec\` writes ${relative}; pass --yes to run it without asking, or --dry-run to preview`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Write ${relative} from ${issue.key}?`
		);
		if (!proceed) {
			print(`  ${style.skip("cancelled; nothing was written")}`);
			return { status: "cancelled", rows: [], path: relative };
		}
	}

	try {
		io.write(join(input.context.repoRoot, relative), content);
	} catch (err) {
		return finish([row(relative, "fail", `could not write the spec: ${describeError(err)}`)], relative);
	}
	return finish([row(relative, "ok", `wrote the spec ${origin}`)], relative);
}
