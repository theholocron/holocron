import { createHash } from "node:crypto";

import {
	ACTIONS,
	REUSABLE_WORKFLOWS,
	WORKFLOW_TEMPLATE_PROPERTIES,
} from "../templates/index.js";
import { WORKFLOW_TEMPLATES } from "./setup-workflows.js";

const DEFAULT_REPO = "theholocron/.github";
const API_BASE = "https://api.github.com";

export type SyncGithubStatus = "ok" | "fail" | "dry-run";

export interface RunSyncGithubInput {
	/** GitHub personal access token with repo write access. */
	token: string;
	/** Target org/repo. Defaults to "theholocron/.github". */
	repo?: string;
	/**
	 * Push files to this branch instead of the default branch.
	 * If the branch doesn't exist it is created from the default branch HEAD.
	 * Combine with `createPr: true` to open a PR after the push.
	 */
	branch?: string;
	/** After pushing to `branch`, open a PR to the default branch. No-op if `branch` is unset. */
	createPr?: boolean;
	/** Commit message for the sync commit. */
	message?: string;
	dryRun?: boolean;
	print?: (line: string) => void;
	/** Injectable for testing. */
	fetch?: typeof globalThis.fetch;
}

export interface SyncGithubReport {
	status: SyncGithubStatus;
	created: number;
	updated: number;
	unchanged: number;
	/** URL of the opened PR, when createPr is true and changes were made. */
	prUrl?: string;
	message?: string;
}

type FileBatch = Array<{ path: string; content: string }>;

function reusableHeader(source: string): string {
	return [
		`# AUTO-GENERATED — do not edit in theholocron/.github directly.`,
		`# Source:  theholocron/holocron · ${source}`,
		`# Synced:  ${new Date().toISOString()}`,
		`# Tool:    holocron sync-github`,
		`# Changes: edit source in theholocron/holocron and push to alpha or main.`,
		``,
	].join("\n");
}

function thinCallerHeader(): string {
	return [
		`# AUTO-GENERATED — do not edit in theholocron/.github directly.`,
		`# Source:  theholocron/holocron · packages/cli/src/commands/setup-workflows.ts`,
		`# Synced:  ${new Date().toISOString()}`,
		`# Tool:    holocron sync-github`,
		`# Changes: edit setup-workflows.ts in theholocron/holocron and push.`,
		``,
	].join("\n");
}

function buildBatch(repo: string): FileBatch {
	const files: FileBatch = [];
	const isPrimaryGithubRepo = repo === DEFAULT_REPO;

	// Composite actions → .github/actions/<name>/action.yml
	// Only the primary .github repo needs these — reusable workflows reference
	// them via the full path `theholocron/.github/.github/actions/setup@main`,
	// so no other repo needs a local copy.
	if (isPrimaryGithubRepo) {
		for (const [name, content] of Object.entries(ACTIONS)) {
			files.push({
				path: `.github/actions/${name}.yml`,
				content: reusableHeader(`packages/cli/src/templates/index.ts`) + content,
			});
		}
	}

	// Reusable workflows → .github/workflows/<name>.yml
	for (const [name, content] of Object.entries(REUSABLE_WORKFLOWS)) {
		files.push({
			path: `.github/workflows/${name}.yml`,
			content: reusableHeader(`packages/cli/src/templates/index.ts`) + content,
		});
	}

	// Thin callers → workflow-templates/<name>.yml + companion .properties.json
	for (const [name, content] of Object.entries(WORKFLOW_TEMPLATES)) {
		files.push({
			path: `workflow-templates/${name}.yml`,
			content: thinCallerHeader() + content,
		});
		const props = WORKFLOW_TEMPLATE_PROPERTIES[name];
		if (props) {
			files.push({
				path: `workflow-templates/${name}.properties.json`,
				content: props,
			});
		}
	}

	return files;
}

/** Git blob SHA: sha1("blob {len}\0{content}") — used to detect unchanged files. */
export function gitBlobSha(content: string): string {
	const buf = Buffer.from(content, "utf8");
	return createHash("sha1")
		.update(`blob ${buf.length}\0`)
		.update(buf)
		.digest("hex");
}

export async function runSyncGithub(input: RunSyncGithubInput): Promise<SyncGithubReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const repo = input.repo ?? DEFAULT_REPO;
	const [owner, repoName] = repo.split("/");
	const { token, dryRun = false, branch, createPr = false } = input;
	const message = input.message ?? `chore: sync from theholocron/holocron`;
	const fetchFn = input.fetch ?? globalThis.fetch;

	const headers = {
		Authorization: `Bearer ${token}`,
		Accept: "application/vnd.github+json",
		"Content-Type": "application/json",
		"X-GitHub-Api-Version": "2022-11-28",
	};

	print(`holocron sync-github${dryRun ? " (dry-run)" : ""}`);
	print(`  repo:   ${repo}`);
	if (branch) print(`  branch: ${branch}`);
	print("");

	const batch = buildBatch(repo);

	// ── 1. Resolve target branch ─────────────────────────────────────────────
	let targetBranch = branch;
	if (!targetBranch) {
		const repoRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}`, { headers });
		if (!repoRes.ok) {
			const msg = "failed to fetch repo metadata";
			print(`  ✗ ${msg}`);
			return { status: "fail", created: 0, updated: 0, unchanged: 0, message: msg };
		}
		const repoData = (await repoRes.json()) as { default_branch: string };
		targetBranch = repoData.default_branch;
	}

	// ── 2. Get HEAD commit → base tree ───────────────────────────────────────
	const refRes = await fetchFn(
		`${API_BASE}/repos/${owner}/${repoName}/git/ref/heads/${targetBranch}`,
		{ headers },
	);
	if (!refRes.ok) {
		const msg = `Branch ${targetBranch} not found`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created: 0, updated: 0, unchanged: 0, message: msg };
	}
	const { object: { sha: headSha } } = (await refRes.json()) as { object: { sha: string } };

	const commitRes = await fetchFn(
		`${API_BASE}/repos/${owner}/${repoName}/git/commits/${headSha}`,
		{ headers },
	);
	const { tree: { sha: baseTreeSha } } = (await commitRes.json()) as { tree: { sha: string } };

	const treeRes = await fetchFn(
		`${API_BASE}/repos/${owner}/${repoName}/git/trees/${baseTreeSha}?recursive=1`,
		{ headers },
	);
	const { tree: existingTree } = (await treeRes.json()) as {
		tree: Array<{ path: string; sha: string; type: string }>;
	};
	const existingBlobs = new Map(
		existingTree.filter((i) => i.type === "blob").map((i) => [i.path, i.sha]),
	);

	// ── 3. Detect changes ────────────────────────────────────────────────────
	let created = 0;
	let updated = 0;
	let unchanged = 0;
	const changedFiles: Array<{ path: string; content: string }> = [];

	for (const file of batch) {
		const localSha = gitBlobSha(file.content);
		const existingSha = existingBlobs.get(file.path);

		if (existingSha === localSha) {
			print(`  · unchanged  ${file.path}`);
			unchanged++;
		} else if (existingSha) {
			print(`  ${dryRun ? "~" : "✓"} updated  ${file.path}`);
			updated++;
			if (!dryRun) changedFiles.push(file);
		} else {
			print(`  ${dryRun ? "~" : "✓"} created  ${file.path}`);
			created++;
			if (!dryRun) changedFiles.push(file);
		}
	}

	print("");
	print(`  ${created} created, ${updated} updated, ${unchanged} unchanged`);

	if (dryRun || changedFiles.length === 0) {
		return { status: dryRun ? "dry-run" : "ok", created, updated, unchanged };
	}

	// ── 4. Create blobs for changed files ────────────────────────────────────
	const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
	for (const file of changedFiles) {
		const blobRes = await fetchFn(
			`${API_BASE}/repos/${owner}/${repoName}/git/blobs`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
			},
		);
		if (!blobRes.ok) {
			const err = (await blobRes.json()) as { message?: string };
			const msg = `failed to create blob for ${file.path}: ${err.message ?? blobRes.status}`;
			print(`  ✗ ${msg}`);
			return { status: "fail", created, updated, unchanged, message: msg };
		}
		const { sha: blobSha } = (await blobRes.json()) as { sha: string };
		treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blobSha });
	}

	// ── 5. Create tree ───────────────────────────────────────────────────────
	const newTreeRes = await fetchFn(
		`${API_BASE}/repos/${owner}/${repoName}/git/trees`,
		{
			method: "POST",
			headers,
			body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
		},
	);
	if (!newTreeRes.ok) {
		const err = (await newTreeRes.json()) as { message?: string };
		const msg = `failed to create tree: ${err.message ?? newTreeRes.status}`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created, updated, unchanged, message: msg };
	}
	const { sha: newTreeSha } = (await newTreeRes.json()) as { sha: string };

	// ── 6. Create commit ─────────────────────────────────────────────────────
	const newCommitRes = await fetchFn(
		`${API_BASE}/repos/${owner}/${repoName}/git/commits`,
		{
			method: "POST",
			headers,
			body: JSON.stringify({ message, tree: newTreeSha, parents: [headSha] }),
		},
	);
	if (!newCommitRes.ok) {
		const err = (await newCommitRes.json()) as { message?: string };
		const msg = `failed to create commit: ${err.message ?? newCommitRes.status}`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created, updated, unchanged, message: msg };
	}
	const { sha: newCommitSha } = (await newCommitRes.json()) as { sha: string };

	// ── 7. Update branch ref ─────────────────────────────────────────────────
	const updateRefRes = await fetchFn(
		`${API_BASE}/repos/${owner}/${repoName}/git/refs/heads/${targetBranch}`,
		{
			method: "PATCH",
			headers,
			body: JSON.stringify({ sha: newCommitSha }),
		},
	);
	if (!updateRefRes.ok) {
		const err = (await updateRefRes.json()) as { message?: string };
		const msg = `failed to update ref: ${err.message ?? updateRefRes.status}`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created, updated, unchanged, message: msg };
	}

	// ── 8. Open PR if requested ──────────────────────────────────────────────
	let prUrl: string | undefined;
	if (branch && createPr && !dryRun) {
		const prRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/pulls`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				title: message,
				head: branch,
				base: "main",
				body: "Auto-generated by `holocron sync-github`. Review and merge to apply template updates.",
			}),
		});

		if (prRes.ok) {
			const pr = (await prRes.json()) as { html_url: string };
			prUrl = pr.html_url;
			print(`  → PR opened: ${prUrl}`);
		} else {
			const err = (await prRes.json()) as { message?: string; errors?: Array<{ message: string }> };
			const alreadyExists = err.errors?.some((e) => e.message.includes("already exists"));
			if (alreadyExists) {
				print(`  → PR already open for ${branch} — branch updated, ready to merge`);
			} else {
				print(`  ⚠ PR creation failed: ${err.message ?? prRes.status}`);
			}
		}
	}

	return { status: "ok", created, updated, unchanged, prUrl };
}
