import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { style } from "../ui/style.js";

interface GitHubRepo {
	name: string;
	full_name: string;
	ssh_url: string;
	archived: boolean;
}

type ExecFn = (cmd: string, args: string[], opts: { cwd: string }) => { status: number | null };

export interface RunCloneInput {
	org: string;
	/** Parent directory to clone into. Defaults to ~/Code/<org>. */
	dir?: string;
	token: string;
	dryRun?: boolean;
	fetch?: typeof globalThis.fetch;
	exec?: ExecFn;
	print?: (line: string) => void;
}

export interface CloneReport {
	status: "ok" | "fail" | "dry-run";
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

export async function runClone(input: RunCloneInput): Promise<CloneReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const fetchFn = input.fetch ?? globalThis.fetch;
	const dryRun = input.dryRun ?? false;
	const targetDir = resolve(input.dir ?? join(homedir(), "Code", input.org));
	const exec: ExecFn =
		input.exec ??
		((cmd, args, opts) => {
			const r = spawnSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" });
			return { status: r.status };
		});

	print(style.header(`Holocron clone — org=${input.org} → ${targetDir}${dryRun ? " (dry-run)" : ""}`));

	if (!existsSync(targetDir)) {
		if (dryRun) {
			print(style.dim(`  would create ${targetDir}`));
		} else {
			mkdirSync(targetDir, { recursive: true });
		}
	}

	let repos: GitHubRepo[];
	try {
		repos = await listOrgRepos(input.org, input.token, fetchFn);
	} catch (err) {
		return {
			status: "fail",
			cloned: 0,
			skipped: 0,
			failed: 0,
			message: err instanceof Error ? err.message : String(err),
		};
	}

	let cloned = 0;
	let skipped = 0;
	let failed = 0;

	for (const repo of repos) {
		const dest = join(targetDir, repo.name);

		if (existsSync(dest)) {
			print(style.dim(`  skip   ${repo.full_name}`));
			skipped++;
			continue;
		}

		if (dryRun) {
			print(style.dim(`  would clone ${repo.full_name} → ${dest}`));
			cloned++;
			continue;
		}

		print(style.step(`  clone  ${repo.full_name}`));
		const result = exec("git", ["clone", repo.ssh_url, dest], { cwd: targetDir });

		if (result.status !== 0) {
			print(style.fail(`  failed ${repo.full_name}`));
			failed++;
		} else {
			print(style.success(`  cloned ${repo.name}`));
			cloned++;
		}
	}

	const summary = `${cloned} cloned, ${skipped} skipped, ${failed} failed`;
	print(dryRun ? style.dim(`\n  dry-run: ${summary}`) : failed > 0 ? style.fail(`\n  ${summary}`) : style.success(`\n  ${summary}`));

	return {
		status: dryRun ? "dry-run" : failed > 0 ? "fail" : "ok",
		cloned,
		skipped,
		failed,
	};
}
