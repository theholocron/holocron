/**
 * `holocron start work <issue>` — the first moments of a piece of work (spec `tool-work-commands`, #2429, part 3).
 *
 * In order: read the issue, set its start date (and Effort when given), make the branch `<type>/<issue>-<slug>` and,
 * by default, a worktree for it, make the first commit (the spec file, or an empty commit titled like the pull
 * request), push, and open a draft pull request linked to the issue. Every step probes first, so a second run
 * carries on where the first stopped: an existing branch is reused, a commit already on it is not made again, the
 * pull request is found by its branch. The board status is left to the open pull request (Sentinel's board-status
 * handler, the hourly `reconcile-projects`); a row says so.
 *
 * It writes to the tracker, the remote and the local repository, so it asks first unless `--dry-run` or `--yes`
 * (without a terminal it refuses). `--dry-run` runs the reads and writes nothing, local git included (not even a
 * fetch). `update work --start` is meant to call this same function.
 */

import { isAbsolute, join, relative } from "node:path";

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

import { assertPluginsResolvable, type IssueRecord, PluginLoader } from "../../../plugin/index.js";
import { findWorktree } from "../find-worktree/index.js";
import { createRealStartWorkIo } from "../real-start-work-io/index.js";
import { buildWorkBody } from "../work-body/index.js";
import { workBranchName } from "../work-branch/index.js";
import { workSlug } from "../work-slug/index.js";
import { workTitle } from "../work-title/index.js";
import type { RunStartWorkInput, StartWorkReport } from "./run-start-work.type.js";

/** The longest a commit subject or pull request title may be. */
const MAX_TITLE = 100;
const DEFAULT_BASE = "alpha";
const WORKTREES = ".claude/worktrees";

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

const ok = (git: (args: readonly string[]) => string, args: readonly string[]): boolean => {
	try {
		git(args);
		return true;
	} catch {
		return false;
	}
};

/** Runs `holocron start work`; see the file's comment. */
export async function runStartWork(input: RunStartWorkInput): Promise<StartWorkReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	const root = input.context.repoRoot;
	const io = input.io ?? createRealStartWorkIo();
	const rows: CheckRow[] = [];
	let report: Partial<StartWorkReport> = {};
	const finish = (): StartWorkReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: summary.fail > 0 ? "fail" : "ok", rows, ...report };
	};
	const fail = (id: string, detail: string): StartWorkReport => {
		rows.push(row(id, "fail", detail));
		return finish();
	};
	print(style.header(`Holocron start work${dryRun ? " (dry-run)" : ""}`));
	print("");

	const key = input.issue.trim();
	if (!key) return fail("issue", "the issue is empty");

	// The checks that need no service.
	const base = (input.base ?? input.loaded.resolved.repo?.defaultBranch ?? DEFAULT_BASE).trim();
	if (!base) return fail("base", "--base is empty");
	if (input.onePr && !input.spec)
		return fail("spec", "--one-pr needs --spec: it is one pull request for the spec and the code");
	let spec: { abs: string; rel: string } | undefined;
	if (input.spec) {
		const abs = isAbsolute(input.spec) ? input.spec : join(root, input.spec);
		const rel = relative(root, abs);
		if (rel.startsWith("..") || isAbsolute(rel)) return fail("spec", `${input.spec} is outside the repository`);
		if (!io.exists(abs)) return fail("spec", `${input.spec} does not exist`);
		spec = { abs, rel };
	}
	const specOnly = Boolean(spec) && !input.onePr;

	// The providers.
	const issuesEntry = input.loaded.resolved.providers.issues;
	if (!issuesEntry) return fail(key, "the config has no `issues` provider to read the issue with");
	const sourceEntry = input.noPr ? undefined : input.loaded.resolved.providers.source;
	if (!input.noPr && !sourceEntry)
		return fail(key, "the config has no `source` provider to open the pull request with");
	const credentials = input.loaded.resolved.providers.credentials;
	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const loader =
		input.loader ??
		new PluginLoader(
			{
				...input.loaded.resolved,
				providers: {
					issues: issuesEntry,
					...(sourceEntry ? { source: sourceEntry } : {}),
					...(credentials ? { credentials } : {}),
				},
			},
			input.context
		);
	/* v8 ignore stop */
	await loader.load();
	assertPluginsResolvable(loader, "start work");
	for (const cap of input.noPr ? (["issues"] as const) : (["issues", "source"] as const)) {
		if (!loader.has(cap)) {
			const failure = loader.loadFailures().find((f) => f.key === cap);
			return fail(
				key,
				`the \`${cap}\` provider is not available${failure ? ` (${describeError(failure.error)})` : ""}`
			);
		}
	}
	const issues = loader.get("issues");
	const source = input.noPr ? undefined : loader.get("source");
	if (source && !source.createPullRequest) {
		return fail(
			"pull request",
			`the \`${source.providerName}\` provider cannot open a pull request (\`--no-pr\` skips it)`
		);
	}

	// Step 1: the issue.
	let issue;
	let record: IssueRecord | undefined;
	try {
		issue = await issues.get(key);
		record = (await issues.export?.({ keys: [key] }).catch(() => []))?.[0];
	} catch (err) {
		return fail(key, `could not read the issue: ${describeError(err)}`);
	}
	rows.push(row(key, "ok", `${issue.summary} (${issue.status})`));

	const named = workTitle({
		issueTitle: issue.summary,
		...(input.kind ? { kind: input.kind } : {}),
		labels: record?.labels ?? [],
		specOnly,
	});
	const title = input.title?.trim() || named.title;
	if (title.length > MAX_TITLE) return fail("title", `"${title}" is over ${MAX_TITLE} characters`);
	const slug = workSlug(input.title?.trim() ? input.title : issue.summary, input.name);
	if (!slug) {
		return fail(
			"name",
			input.name ? `--name "${input.name}" must be kebab-case` : "no name can be made from the title; pass --name"
		);
	}
	const branch = workBranchName(named.type, key, slug);
	if (!branch) return fail("branch", `"${key}" has no number to name a branch with`);
	const useWorktree = input.worktree !== false;
	const wtPath = input.worktreePath
		? isAbsolute(input.worktreePath)
			? input.worktreePath
			: join(root, input.worktreePath)
		: join(root, WORKTREES, slug);
	const git = (args: readonly string[], cwd = root) => io.git(args, cwd);
	const gitAt = (cwd: string) => (args: readonly string[]) => io.git(args, cwd);
	const branchExists = ok(gitAt(root), ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
	const link = { issue: key, keyword: specOnly ? ("Refs" as const) : ("Closes" as const) };
	report = { branch, title };

	const commitSubject = spec ? `docs(specs): add the spec for ${named.subject}`.slice(0, MAX_TITLE) : title;
	const releaseNote =
		(named.type === "feat" || named.type === "fix") && base === DEFAULT_BASE
			? `; a ${named.type} to ${base} publishes a prerelease`
			: "";
	const summary = [
		`branch ${branch}${branchExists ? " (exists)" : ""}`,
		useWorktree ? `worktree ${relative(root, wtPath) || wtPath}` : "no worktree",
		spec ? `first commit: ${spec.rel}` : "first commit: empty",
		...(source ? [`draft pull request "${title}" (${link.keyword} ${key})`] : ["no pull request"]),
	].join("; ");

	if (dryRun) {
		rows.push(row("title", "skip", `${title} (${named.reason}${releaseNote})`));
		rows.push(
			row(
				"start date",
				"skip",
				`would set the start date${input.effort ? ` and Effort ${input.effort}` : ""}${branchExists ? " (not again: the branch exists)" : ""}`
			)
		);
		rows.push(row("branch", "skip", `would ${branchExists ? "reuse" : "make"} ${branch} from origin/${base}`));
		if (useWorktree) rows.push(row("worktree", "skip", `would use ${wtPath}`));
		rows.push(row("first commit", "skip", `would commit${spec ? ` ${spec.rel}` : " empty"} as "${commitSubject}"`));
		rows.push(row("push", "skip", `would push ${branch} to origin`));
		if (source)
			rows.push(
				row("pull request", "skip", `would open a draft pull request against ${base}, ${link.keyword} ${key}`)
			);
		rows.push(row("board status", "skip", "the open pull request moves the issue to In Progress"));
		return finish();
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				"`start work` writes to the tracker, the remote and this repository; pass --yes to run it without asking, or --dry-run to preview"
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Start work on ${key}: ${summary}?`
		);
		if (!proceed) {
			print(`  ${style.skip("cancelled; nothing was changed")}`);
			return { status: "cancelled", rows: [] };
		}
	}
	rows.push(row("title", "ok", `${title} (${named.reason}${releaseNote})`));

	// Step 2: the start date, only for a branch this run makes, because the issue's current value cannot be read.
	if (branchExists) {
		rows.push(
			row("start date", "skip", "the branch exists, so the work started before; the start date is left as it is")
		);
	} else if (!issues.update) {
		rows.push(row("start date", "skip", `the \`${issues.providerName}\` provider cannot update an issue`));
	} else {
		try {
			const result = await issues.update(key, {
				startDate: io.today(),
				...(input.effort ? { effort: input.effort } : {}),
			});
			rows.push(
				row("start date", "ok", result.changed.length > 0 ? result.changed.join(", ") : "already as asked")
			);
			for (const line of result.dropped ?? []) rows.push(row("not carried across", "skip", line));
		} catch (err) {
			rows.push(row("start date", "fail", `could not update the issue: ${describeError(err)}`));
		}
	}

	// Steps 3 to 5: the branch, the worktree, the first commit and the push; the first failure stops here.
	let dir = root;
	try {
		io.git(["fetch", "origin", base], root);
		const start = `origin/${base}`;
		if (branchExists) {
			dir = findWorktree(io.git, root, branch) ?? root;
			if (useWorktree && dir === root && io.git(["rev-parse", "--abbrev-ref", "HEAD"], root) !== branch) {
				io.git(["worktree", "add", wtPath, branch], root);
				dir = wtPath;
			} else if (!useWorktree && io.git(["rev-parse", "--abbrev-ref", "HEAD"], root) !== branch && dir === root) {
				io.git(["switch", branch], root);
			}
			rows.push(row("branch", "ok", `${branch} already exists; reused`));
		} else if (useWorktree) {
			io.git(["worktree", "add", "--no-track", "-b", branch, wtPath, start], root);
			dir = wtPath;
			rows.push(row("branch", "ok", `made ${branch} from ${start}`));
		} else {
			io.git(["switch", "--no-track", "-c", branch, start], root);
			rows.push(row("branch", "ok", `made ${branch} from ${start} and switched to it`));
		}
		report = { ...report, directory: dir };
		if (useWorktree) rows.push(row("worktree", "ok", dir));

		const ahead = Number(git(["rev-list", "--count", `${start}..${branch}`]) || "0");
		if (ahead > 0) {
			rows.push(row("first commit", "skip", `${branch} already has ${ahead} commit${ahead === 1 ? "" : "s"}`));
		} else {
			const trailer = `Refs ${key}`;
			if (spec) {
				if (dir !== root) io.write(join(dir, spec.rel), io.read(spec.abs));
				io.git(["add", "--", spec.rel], dir);
				const status = /^status:\s*(\S+)/m.exec(io.read(spec.abs))?.[1];
				if (status && status !== "draft")
					rows.push(row("spec", "skip", `the spec's status is ${status}, not draft`));
			}
			io.git(["commit", "-s", ...(spec ? [] : ["--allow-empty"]), "-m", commitSubject, "-m", trailer], dir);
			rows.push(row("first commit", "ok", `${io.git(["rev-parse", "--short", "HEAD"], dir)} ${commitSubject}`));
		}

		io.git(["push", "-u", "origin", branch], dir);
		rows.push(row("push", "ok", `${branch} is on origin`));
	} catch (err) {
		rows.push(row("git", "fail", `${describeError(err)}; nothing was deleted, run the command again to carry on`));
		return finish();
	}

	// Step 6: the draft pull request.
	if (source) {
		try {
			const assignees = [
				...new Set([...(record?.assignee?.login ? [record.assignee.login] : []), ...(input.assignees ?? [])]),
			];
			const mirrored = {
				...(record?.labels.length ? { labels: record.labels } : {}),
				...(record?.milestone ? { milestone: record.milestone } : {}),
				...(assignees.length > 0 ? { assignees } : {}),
				...(input.project ? { projects: [input.project] } : {}),
			};
			const result = await source.createPullRequest!({
				title,
				head: branch,
				base,
				draft: true,
				body: buildWorkBody({
					issue: key,
					issueTitle: issue.summary,
					...(issue.url ? { issueUrl: issue.url } : {}),
					...(spec ? { spec: spec.rel } : {}),
				}),
				link,
				...mirrored,
			});
			const pr = result.pullRequest;
			report = { ...report, pullRequest: { number: pr.number, url: pr.url, created: result.created } };
			rows.push(
				row(
					"pull request",
					"ok",
					`${result.created ? "opened" : "already open:"} #${pr.number}${result.draft ? " (draft)" : ""} ${pr.url}`
				)
			);
			for (const line of result.dropped) rows.push(row("not carried across", "skip", line));
		} catch (err) {
			rows.push(
				row(
					"pull request",
					"fail",
					`could not open the pull request: ${describeError(err)}; run the command again to open it`
				)
			);
		}
	}
	rows.push(
		row(
			"board status",
			"skip",
			"not set: the open pull request moves the issue to In Progress; `update work --status` sets it by hand while the automation is down"
		)
	);
	return finish();
}
