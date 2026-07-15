import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ACTIONS, REUSABLE_WORKFLOWS, WORKFLOW_TEMPLATE_PROPERTIES } from "../templates/index.js";
import { WORKFLOW_TEMPLATES, generateThinCallerContent } from "./setup-workflows.js";

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
	/**
	 * Write generated files to this local directory instead of pushing to the GitHub API.
	 * Useful for local validation (e.g. actionlint) before a real sync run.
	 * When set, no API calls are made and token is not required.
	 */
	outputDir?: string;
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

function thinCallerHeader(forPrimary = false): string {
	const doNotEdit = forPrimary
		? `# AUTO-GENERATED — do not edit in theholocron/.github directly.`
		: `# AUTO-GENERATED — do not edit directly.`;
	return [
		doNotEdit,
		`# Source:  theholocron/holocron · packages/cli/src/commands/setup-workflows.ts`,
		`# Synced:  ${new Date().toISOString()}`,
		`# Tool:    holocron sync-github`,
		`# Changes: edit source in theholocron/holocron and push to alpha or main.`,
		``,
	].join("\n");
}

function buildBatch(repo: string, allowedWorkflows?: Set<string>): FileBatch {
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

	if (isPrimaryGithubRepo) {
		// Reusable workflow definitions → .github/workflows/<name>.yml
		// Only .github hosts the implementations; all other repos call them via uses:.
		for (const [name, content] of Object.entries(REUSABLE_WORKFLOWS)) {
			files.push({
				path: `.github/workflows/${name}.yml`,
				content: reusableHeader(`packages/cli/src/templates/index.ts`) + content,
			});
		}

		// Workflow templates (starter templates for the Actions UI) → workflow-templates/
		// Only the primary .github repo surfaces these in GitHub's "New workflow" picker.
		for (const [name, content] of Object.entries(WORKFLOW_TEMPLATES)) {
			files.push({
				path: `workflow-templates/${name}.yml`,
				content: thinCallerHeader(true) + content,
			});
			const props = WORKFLOW_TEMPLATE_PROPERTIES[name];
			if (props) {
				files.push({
					path: `workflow-templates/${name}.properties.json`,
					content: props,
				});
			}
		}
	} else {
		// Secondary repos get thin callers in .github/workflows/ that delegate to
		// .github's reusable implementations. The config may restrict which workflows
		// a repo receives via project.workflows; undefined means all.
		for (const name of Object.keys(REUSABLE_WORKFLOWS)) {
			if (allowedWorkflows && !allowedWorkflows.has(name)) continue;
			const content = generateThinCallerContent(name);
			if (!content) continue;
			files.push({
				path: `.github/workflows/${name}.yml`,
				content: thinCallerHeader() + content,
			});
		}
	}

	return files;
}

/** Git blob SHA: sha1("blob {len}\0{content}") — used to detect unchanged files. */
export function gitBlobSha(content: string): string {
	const buf = Buffer.from(content, "utf8");
	return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
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

	// ── output-dir: write all files to disk without any API calls ───────────
	// Always generates the full unfiltered batch — used for local validation
	// (actionlint smoke test) where we want to check every template.
	if (input.outputDir) {
		const batch = buildBatch(repo);
		for (const file of batch) {
			const dest = join(input.outputDir, file.path);
			mkdirSync(dirname(dest), { recursive: true });
			writeFileSync(dest, file.content, "utf8");
		}
		print(`  ${batch.length} files written to ${input.outputDir}`);
		return { status: "ok", created: batch.length, updated: 0, unchanged: 0 };
	}

	// ── 1. Resolve target branch ─────────────────────────────────────────────
	// When opening a PR, the commit is based on the default branch and the
	// PR branch (--branch) is created fresh. For direct pushes, --branch is
	// used as-is (falls back to default if omitted).
	let targetBranch = branch;
	let defaultBranch: string | undefined;
	if (!targetBranch || createPr) {
		const repoRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}`, { headers });
		if (!repoRes.ok) {
			const msg = "failed to fetch repo metadata";
			print(`  ✗ ${msg}`);
			return { status: "fail", created: 0, updated: 0, unchanged: 0, message: msg };
		}
		const repoData = (await repoRes.json()) as { default_branch: string };
		defaultBranch = repoData.default_branch;
		if (!targetBranch) targetBranch = defaultBranch;
	}

	// ── 2. Get HEAD commit → base tree ───────────────────────────────────────
	// Always read existing state from the default branch when creating a PR.
	const baseBranch = createPr && defaultBranch ? defaultBranch : targetBranch;
	const refRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/git/ref/heads/${baseBranch}`, { headers });
	if (!refRes.ok) {
		const msg = `Branch ${baseBranch} not found`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created: 0, updated: 0, unchanged: 0, message: msg };
	}
	const {
		object: { sha: headSha },
	} = (await refRes.json()) as { object: { sha: string } };

	const commitRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/git/commits/${headSha}`, { headers });
	const {
		tree: { sha: baseTreeSha },
	} = (await commitRes.json()) as { tree: { sha: string } };

	const treeRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/git/trees/${baseTreeSha}?recursive=1`, {
		headers,
	});
	const { tree: existingTree } = (await treeRes.json()) as {
		tree: Array<{ path: string; sha: string; type: string }>;
	};
	const existingBlobs = new Map(existingTree.filter((i) => i.type === "blob").map((i) => [i.path, i.sha]));

	// ── 3. Fetch workflow allowlist from target repo config ───────────────────
	// Secondary repos may declare which reusable workflows they want via their
	// own holocron.config.json. If present and non-empty, only those workflows
	// are synced; missing or empty config means all workflows are synced.
	let allowedWorkflows: Set<string> | undefined;
	if (repo !== DEFAULT_REPO) {
		try {
			const configRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/contents/holocron.config.json`, {
				headers,
			});
			if (configRes.ok) {
				const configData = (await configRes.json()) as { content: string };
				const raw = JSON.parse(
					Buffer.from(configData.content.replace(/\n/g, ""), "base64").toString("utf8")
				) as { project?: { workflows?: Array<string | { name: string }> } };
				const workflows = raw?.project?.workflows ?? [];
				if (workflows.length > 0) {
					allowedWorkflows = new Set(workflows.map((w) => (typeof w === "string" ? w : w.name)));
				}
			}
		} catch {
			// No config or parse error — sync all workflows
		}
	}

	// ── 4. Build file batch ──────────────────────────────────────────────────
	const batch = buildBatch(repo, allowedWorkflows);

	// ── 5. Detect changes ────────────────────────────────────────────────────
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

	// ── 6. Create blobs for changed files ────────────────────────────────────
	const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
	for (const file of changedFiles) {
		const blobRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/git/blobs`, {
			method: "POST",
			headers,
			body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
		});
		if (!blobRes.ok) {
			const err = (await blobRes.json()) as { message?: string };
			const msg = `failed to create blob for ${file.path}: ${err.message ?? blobRes.status}`;
			print(`  ✗ ${msg}`);
			return { status: "fail", created, updated, unchanged, message: msg };
		}
		const { sha: blobSha } = (await blobRes.json()) as { sha: string };
		treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blobSha });
	}

	// ── 7. Create tree ───────────────────────────────────────────────────────
	const newTreeRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/git/trees`, {
		method: "POST",
		headers,
		body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
	});
	if (!newTreeRes.ok) {
		const err = (await newTreeRes.json()) as { message?: string };
		const msg = `failed to create tree: ${err.message ?? newTreeRes.status}`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created, updated, unchanged, message: msg };
	}
	const { sha: newTreeSha } = (await newTreeRes.json()) as { sha: string };

	// ── 8. Create commit ─────────────────────────────────────────────────────
	const newCommitRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/git/commits`, {
		method: "POST",
		headers,
		body: JSON.stringify({ message, tree: newTreeSha, parents: [headSha] }),
	});
	if (!newCommitRes.ok) {
		const err = (await newCommitRes.json()) as { message?: string };
		const msg = `failed to create commit: ${err.message ?? newCommitRes.status}`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created, updated, unchanged, message: msg };
	}
	const { sha: newCommitSha } = (await newCommitRes.json()) as { sha: string };

	// ── 9. Update (or create) branch ref ────────────────────────────────────
	// For PR mode: try to create the branch; if it already exists from a
	// previous partial run, force-update it instead.
	// For direct push: fast-forward the existing branch.
	let refUpdateRes: Response;
	if (createPr && branch) {
		refUpdateRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/git/refs`, {
			method: "POST",
			headers,
			body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: newCommitSha }),
		});
		if (refUpdateRes.status === 422) {
			refUpdateRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/git/refs/heads/${branch}`, {
				method: "PATCH",
				headers,
				body: JSON.stringify({ sha: newCommitSha, force: true }),
			});
		}
	} else {
		refUpdateRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/git/refs/heads/${targetBranch}`, {
			method: "PATCH",
			headers,
			body: JSON.stringify({ sha: newCommitSha }),
		});
	}
	if (!refUpdateRes.ok) {
		const err = (await refUpdateRes.json()) as { message?: string };
		const msg = `failed to update ref: ${err.message ?? refUpdateRes.status}`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created, updated, unchanged, message: msg };
	}

	// ── 10. Open PR if requested ─────────────────────────────────────────────
	let prUrl: string | undefined;
	if (branch && createPr && !dryRun) {
		const prRes = await fetchFn(`${API_BASE}/repos/${owner}/${repoName}/pulls`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				title: message.split("\n")[0],
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
