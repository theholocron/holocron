import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createGitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

import { ACTIONS, REUSABLE_WORKFLOWS, WORKFLOW_TEMPLATE_PROPERTIES } from "../templates/index.js";
import { generateThinCallerContent, WORKFLOW_TEMPLATES } from "./setup-workflows.js";

const DEFAULT_REPO = "theholocron/.github";

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
type WorkflowEntry = { name: string; with?: Record<string, unknown> };

/**
 * Extracts the `workflows` array from a `holocron.config.ts` source string.
 * Handles both plain string entries and `{ name, with }` object entries.
 * Falls back to an empty array if the array cannot be found or parsed.
 */
function parseWorkflowsFromTs(source: string): WorkflowEntry[] {
	const keyMatch = source.match(/\bworkflows\s*:\s*\[/);
	if (!keyMatch) return [];

	// Walk forward to find the matching ]
	const start = keyMatch.index! + keyMatch[0].length;
	let depth = 1;
	let i = start;
	while (i < source.length && depth > 0) {
		if (source[i] === "[") depth++;
		else if (source[i] === "]") depth--;
		i++;
	}
	const body = source.slice(start, i - 1);

	const entries: Array<{ pos: number; entry: WorkflowEntry }> = [];
	const objSpans: Array<[number, number]> = [];

	// Pass 1: object entries — { name: "foo", with: { ... } }
	const objRe = /\{\s*name\s*:\s*"([^"]+)"(?:\s*,\s*with\s*:\s*(\{[^}]*\}))?\s*\}/g;
	let m: RegExpExecArray | null;
	while ((m = objRe.exec(body)) !== null) {
		objSpans.push([m.index, m.index + m[0].length]);
		let withObj: Record<string, unknown> | undefined;
		if (m[2]) {
			try {
				withObj = JSON.parse(m[2]);
			} catch {
				/* ignore malformed with: value */
			}
		}
		entries.push({ pos: m.index, entry: { name: m[1], ...(withObj && { with: withObj }) } });
	}

	// Pass 2: simple string entries — "workflowname" — skip chars inside object spans
	const strRe = /"([^"]+)"/g;
	while ((m = strRe.exec(body)) !== null) {
		if (!objSpans.some(([s, e]) => m!.index >= s && m!.index < e)) {
			entries.push({ pos: m.index, entry: { name: m[1] } });
		}
	}

	entries.sort((a, b) => a.pos - b.pos);
	return entries.map(({ entry }) => entry);
}

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

function buildBatch(
	repo: string,
	allowedWorkflows?: Set<string>,
	withOverrides?: Map<string, Record<string, unknown>>
): FileBatch {
	const files: FileBatch = [];
	const isPrimaryGithubRepo = repo === DEFAULT_REPO;

	if (isPrimaryGithubRepo) {
		for (const [name, content] of Object.entries(ACTIONS)) {
			files.push({
				path: `.github/actions/${name}.yml`,
				content: reusableHeader(`packages/cli/src/templates/index.ts`) + content,
			});
		}
	}

	if (isPrimaryGithubRepo) {
		for (const [name, content] of Object.entries(REUSABLE_WORKFLOWS)) {
			files.push({
				path: `.github/workflows/${name}.yml`,
				content: reusableHeader(`packages/cli/src/templates/index.ts`) + content,
			});
		}

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
		for (const name of Object.keys(REUSABLE_WORKFLOWS)) {
			if (allowedWorkflows && !allowedWorkflows.has(name)) continue;
			const content = generateThinCallerContent(name, withOverrides?.get(name));
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
	const { token, dryRun = false, branch, createPr = false } = input;
	const message = input.message ?? `chore: sync from theholocron/holocron`;

	const client = createGitHubClient({ token, fetch: input.fetch });

	print(`holocron sync-github${dryRun ? " (dry-run)" : ""}`);
	print(`  repo:   ${repo}`);
	if (branch) print(`  branch: ${branch}`);
	print("");

	// ── output-dir: write all files to disk without any API calls ───────────
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
	let targetBranch = branch;
	let defaultBranch: string | undefined;
	if (!targetBranch || createPr) {
		try {
			const repoData = await client.repos.getRepo(repo);
			defaultBranch = repoData.default_branch;
			if (!targetBranch) targetBranch = defaultBranch;
		} catch {
			const msg = "failed to fetch repo metadata";
			print(`  ✗ ${msg}`);
			return { status: "fail", created: 0, updated: 0, unchanged: 0, message: msg };
		}
	}

	// ── 2. Get HEAD commit → base tree ───────────────────────────────────────
	const baseBranch = createPr && defaultBranch ? defaultBranch : targetBranch!;
	let headSha: string;
	let baseTreeSha: string;
	let existingBlobs: Map<string, string>;
	try {
		const ref = await client.git.getRef(repo, baseBranch);
		headSha = ref.object.sha;
		const commit = await client.git.getCommit(repo, headSha);
		baseTreeSha = commit.tree.sha;
		const treeData = await client.git.getTree(repo, baseTreeSha, true);
		existingBlobs = new Map(treeData.tree.filter((i) => i.type === "blob").map((i) => [i.path, i.sha]));
	} catch (err) {
		const msg = err instanceof Error ? err.message : `Branch ${baseBranch} not found`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created: 0, updated: 0, unchanged: 0, message: msg };
	}

	// ── 3. Fetch workflow allowlist + per-workflow overrides from target repo ─
	let allowedWorkflows: Set<string> | undefined;
	let withOverrides: Map<string, Record<string, unknown>> | undefined;
	if (repo !== DEFAULT_REPO) {
		try {
			let entries: WorkflowEntry[] = [];

			try {
				const data = await client.git.getContents(repo, "holocron.config.json");
				const raw = JSON.parse(Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")) as {
					workflows?: Array<string | WorkflowEntry>;
				};
				entries = (raw?.workflows ?? []).map((w) => (typeof w === "string" ? { name: w } : w));
			} catch (err) {
				if (!(err instanceof ProviderApiError) || err.status !== 404) throw err;
				// Fall back to .ts config
				try {
					const data = await client.git.getContents(repo, "holocron.config.ts");
					const source = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
					entries = parseWorkflowsFromTs(source);
				} catch {
					// No config — sync all workflows with no overrides
				}
			}

			if (entries.length > 0) {
				allowedWorkflows = new Set(entries.map((e) => e.name));
				const overrideEntries = entries.filter((e) => e.with != null).map((e) => [e.name, e.with!] as const);
				if (overrideEntries.length > 0) withOverrides = new Map(overrideEntries);
			}
		} catch {
			// Parse error — sync all workflows with no overrides
		}
	}

	// ── 4. Build file batch ──────────────────────────────────────────────────
	const batch = buildBatch(repo, allowedWorkflows, withOverrides);

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
		try {
			const blob = await client.git.createBlob(repo, file.content);
			treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
		} catch (err) {
			const msg = `failed to create blob for ${file.path}: ${err instanceof Error ? err.message : String(err)}`;
			print(`  ✗ ${msg}`);
			return { status: "fail", created, updated, unchanged, message: msg };
		}
	}

	// ── 7. Create tree ───────────────────────────────────────────────────────
	let newTreeSha: string;
	try {
		const newTree = await client.git.createTree(repo, treeEntries, baseTreeSha);
		newTreeSha = newTree.sha;
	} catch (err) {
		const msg = `failed to create tree: ${err instanceof Error ? err.message : String(err)}`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created, updated, unchanged, message: msg };
	}

	// ── 8. Create commit ─────────────────────────────────────────────────────
	let newCommitSha: string;
	try {
		const newCommit = await client.git.createCommit(repo, message, newTreeSha, [headSha]);
		newCommitSha = newCommit.sha;
	} catch (err) {
		const msg = `failed to create commit: ${err instanceof Error ? err.message : String(err)}`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created, updated, unchanged, message: msg };
	}

	// ── 9. Update (or create) branch ref ────────────────────────────────────
	try {
		if (createPr && branch) {
			try {
				await client.git.createRef(repo, `refs/heads/${branch}`, newCommitSha);
			} catch (err) {
				if (!(err instanceof ProviderApiError) || err.status !== 422) throw err;
				// Branch already exists from a previous partial run — force-update it.
				await client.git.updateRef(repo, `heads/${branch}`, newCommitSha, true);
			}
		} else {
			await client.git.updateRef(repo, `heads/${targetBranch!}`, newCommitSha);
		}
	} catch (err) {
		const msg = `failed to update ref: ${err instanceof Error ? err.message : String(err)}`;
		print(`  ✗ ${msg}`);
		return { status: "fail", created, updated, unchanged, message: msg };
	}

	// ── 10. Open PR if requested ─────────────────────────────────────────────
	let prUrl: string | undefined;
	if (branch && createPr && !dryRun) {
		try {
			const pr = await client.git.createPull(repo, {
				title: message.split("\n")[0]!,
				head: branch,
				base: "main",
				body: "Auto-generated by `holocron sync-github`. Review and merge to apply template updates.",
			});
			prUrl = pr.html_url;
			print(`  → PR opened: ${prUrl}`);
		} catch (err) {
			const alreadyExists =
				err instanceof ProviderApiError && err.status === 422 && String(err.details).includes("already exists");
			if (alreadyExists) {
				print(`  → PR already open for ${branch} — branch updated, ready to merge`);
			} else {
				print(`  ⚠ PR creation failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	return { status: "ok", created, updated, unchanged, prUrl };
}
