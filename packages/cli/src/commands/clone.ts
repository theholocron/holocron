import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { errorMessage } from "@theholocron/misc-utils";
import type { Logger } from "@theholocron/observability/core";

import { getLogger } from "../logger.js";
import { statusRow } from "../ui/status-row.js";
import { style } from "../ui/style.js";

export interface CloneTarget {
	org: string;
	/** Set only when the input was `org/repo` — clone just this one repo instead of the whole org. */
	repo?: string;
}

/**
 * Accepts a bare org (`"theholocron"`) — clones every repo in it — or an
 * `org/repo` coordinate (`"theholocron/new-repo"`) — clones just that one
 * repo. The repo half is never silently discarded: if it's there, it's used.
 * A trailing slash with nothing after it (`"theholocron/"`) is treated the
 * same as a bare org.
 */
export function parseCloneTarget(raw: string): CloneTarget {
	const trimmed = raw.trim();
	const slash = trimmed.indexOf("/");
	if (slash === -1) return { org: trimmed };
	const org = trimmed.slice(0, slash);
	const repo = trimmed.slice(slash + 1);
	return repo ? { org, repo } : { org };
}

function encodeTokenForGitHttpAuth(token: string): string {
	const trimmed = token.trim();
	if (!trimmed) throw new Error("empty token");
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001F\u007F\s]/.test(trimmed)) {
		throw new Error("token contains whitespace or control characters");
	}
	return encodeURIComponent(trimmed);
}

interface GitHubRepo {
	name: string;
	full_name: string;
	clone_url: string;
	archived: boolean;
}

/** Strip a leading dot so a hidden repo (e.g. `.github`) is still visible in Finder once cloned. */
function repoDirName(repo: GitHubRepo): string {
	return repo.name.startsWith(".") ? repo.name.slice(1) : repo.name;
}

type ExecFn = (cmd: string, args: string[], opts: { cwd: string }) => { status: number | null };

/** How many of an org's repos are already cloned locally vs. would actually be new. */
export interface WholeOrgScope {
	total: number;
	alreadyCloned: number;
	toClone: number;
}

export interface RunCloneInput {
	org: string;
	/** Clone just this one repo instead of every repo in `org`. */
	repo?: string;
	/** Parent directory to clone into. Defaults to ~/Code/<org>. */
	dir?: string;
	token: string;
	dryRun?: boolean;
	fetch?: typeof globalThis.fetch;
	exec?: ExecFn;
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/**
	 * Called once, before cloning, only in whole-org mode (never for a
	 * single `repo` clone, never when `dryRun` is set — nothing destructive
	 * happens either way). Return `false` to abort without cloning
	 * anything. Omit entirely to skip confirmation (e.g. a non-interactive
	 * caller that already passed `--all` deliberately).
	 */
	confirmWholeOrg?: (scope: WholeOrgScope) => Promise<boolean>;
	/**
	 * Called once at the end — for a single `repo` clone, with that repo's
	 * own directory; for a whole-org clone, with the surrounding `targetDir`
	 * that holds every repo. Only called when that path actually exists on
	 * disk: always true after a real run (cloned or skipped-because-already-
	 * there), but a dry run's "would clone" path for anything brand new
	 * never exists yet, so this naturally stays silent there.
	 *
	 * The second argument is true for a dry run that found something it
	 * would actually clone — a real run (or a menu-launched "proceed with
	 * the real run?" decision) may still follow, so a caller that only wants
	 * to ask once, at the true end of the road, can defer in that case.
	 * Omit `confirmOpen` entirely to skip — e.g. a non-interactive caller
	 * with nothing to open to.
	 */
	confirmOpen?: (path: string, moreToCome: boolean) => Promise<void>;
}

export interface CloneReport {
	status: "ok" | "fail" | "dry-run" | "aborted";
	cloned: number;
	skipped: number;
	failed: number;
	message?: string;
}

async function listOrgRepos(org: string, token: string, fetchFn: typeof globalThis.fetch): Promise<GitHubRepo[]> {
	const repos: GitHubRepo[] = [];
	let url: string | null = `https://api.github.com/orgs/${org}/repos?per_page=100&type=all`;

	while (url) {
		const res = await fetchFn(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});

		if (!res.ok) {
			throw new Error(`GitHub API ${res.status}: ${res.statusText} — check that the token has org:read scope`);
		}

		repos.push(...((await res.json()) as GitHubRepo[]));

		const link = res.headers.get("link");
		const next = link?.match(/<([^>]+)>;\s*rel="next"/);
		url = next ? next[1] : null;
	}

	return repos;
}

async function getRepo(
	org: string,
	repo: string,
	token: string,
	fetchFn: typeof globalThis.fetch
): Promise<GitHubRepo> {
	const res = await fetchFn(`https://api.github.com/repos/${org}/${repo}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});

	if (res.status === 404) {
		throw new Error(`${org}/${repo} not found — check the repo name and that the token can see it`);
	}
	if (!res.ok) {
		throw new Error(`GitHub API ${res.status}: ${res.statusText} — check that the token has repo:read scope`);
	}

	return (await res.json()) as GitHubRepo;
}

export async function runClone(input: RunCloneInput): Promise<CloneReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const fetchFn = input.fetch ?? globalThis.fetch;
	const dryRun = input.dryRun ?? false;
	const targetDir = resolve(input.dir ?? join(homedir(), "Code", input.org));
	logger.info({ org: input.org, repo: input.repo, targetDir, dryRun: dryRun || undefined }, "clone: start");
	const exec: ExecFn =
		input.exec ??
		((cmd, args, opts) => {
			const r = spawnSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" });
			return { status: r.status };
		});

	print("");

	if (!existsSync(targetDir)) {
		if (dryRun) {
			print(style.dim(`  would create ${targetDir}`));
		} else {
			mkdirSync(targetDir, { recursive: true });
		}
	}

	let repos: GitHubRepo[];
	try {
		repos = input.repo
			? [await getRepo(input.org, input.repo, input.token, fetchFn)]
			: await listOrgRepos(input.org, input.token, fetchFn);
	} catch (err) {
		const message = errorMessage(err);
		logger.warn({ org: input.org, repo: input.repo, reason: message }, "clone: failed to list repos");
		return { status: "fail", cloned: 0, skipped: 0, failed: 0, message };
	}

	if (!input.repo && !dryRun && input.confirmWholeOrg) {
		const alreadyCloned = repos.filter((r) => existsSync(join(targetDir, repoDirName(r)))).length;
		const scope: WholeOrgScope = { total: repos.length, alreadyCloned, toClone: repos.length - alreadyCloned };
		const proceed = await input.confirmWholeOrg(scope);
		if (!proceed) {
			print(style.dim("  aborted — nothing cloned"));
			logger.info({ org: input.org, ...scope }, "clone: aborted by user");
			return { status: "aborted", cloned: 0, skipped: 0, failed: 0, message: "aborted by user" };
		}
	}

	let cloned = 0;
	let skipped = 0;
	let failed = 0;

	for (const repo of repos) {
		const dest = join(targetDir, repoDirName(repo));

		if (existsSync(dest)) {
			print(statusRow("skip", [repo.full_name, dest, "already exists"]));
			skipped++;
			continue;
		}

		if (dryRun) {
			print(style.dim(`  would clone ${repo.full_name} → ${dest}`));
			cloned++;
			continue;
		}

		print(style.step(`  clone  ${repo.full_name} → ${dest}`));
		const { clone_url } = repo;
		if (!clone_url.startsWith("https://github.com/")) {
			print(statusRow("fail", [repo.full_name, dest, `unexpected clone URL: ${clone_url}`]));
			failed++;
			continue;
		}
		let encodedToken: string;
		try {
			encodedToken = encodeTokenForGitHttpAuth(input.token);
		} catch (err) {
			print(statusRow("fail", [repo.full_name, dest, `invalid token format: ${errorMessage(err)}`]));
			failed++;
			continue;
		}
		const authedUrl = `https://x-access-token:${encodedToken}@github.com/${clone_url.slice("https://github.com/".length)}`;
		const result = exec("git", ["clone", "--", authedUrl, dest], { cwd: targetDir });

		if (result.status !== 0) {
			print(statusRow("fail", [repo.full_name, dest]));
			failed++;
		} else {
			print(statusRow("ok", [repo.full_name, dest]));
			cloned++;
		}
	}

	const summary = `${cloned} cloned, ${skipped} skipped, ${failed} failed`;
	print("");
	print(
		dryRun
			? style.dim(`  dry-run: ${summary}`)
			: failed > 0
				? style.fail(`  ${summary}`)
				: style.success(`  ${summary}`)
	);

	const status = dryRun ? "dry-run" : failed > 0 ? "fail" : "ok";
	logger[failed > 0 ? "warn" : "info"](
		{ org: input.org, repo: input.repo, status, cloned, skipped, failed },
		"clone: done"
	);

	if (input.confirmOpen) {
		const openTarget = input.repo ? join(targetDir, repoDirName(repos[0]!)) : targetDir;
		if (existsSync(openTarget)) await input.confirmOpen(openTarget, dryRun && cloned > 0);
	}

	return { status, cloned, skipped, failed };
}
