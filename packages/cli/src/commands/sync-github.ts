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
	let created = 0;
	let updated = 0;
	let unchanged = 0;

	for (const file of batch) {
		// When targeting a branch, include ?ref=<branch> on the GET so we read
		// the file's current SHA on that branch (not the default branch SHA).
		const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
		const url = `${API_BASE}/repos/${owner}/${repoName}/contents/${file.path}`;
		const newContent = Buffer.from(file.content, "utf8").toString("base64");

		let existingSha: string | undefined;
		let existingContent: string | undefined;
		try {
			const getRes = await fetchFn(`${url}${ref}`, { headers });
			if (getRes.ok) {
				const data = (await getRes.json()) as { sha: string; content: string };
				existingSha = data.sha;
				existingContent = data.content.replace(/\n/g, "");
			}
		} catch {
			// Network error — surfaced on the PUT below
		}

		if (existingContent === newContent) {
			print(`  · unchanged  ${file.path}`);
			unchanged++;
			continue;
		}

		const verb = existingSha ? "updated " : "created ";
		if (dryRun) {
			print(`  ~ ${verb} ${file.path}`);
			if (existingSha) { updated++; } else { created++; }
			continue;
		}

		const body: Record<string, unknown> = { message, content: newContent };
		if (existingSha) body.sha = existingSha;
		if (branch) body.branch = branch;

		const putRes = await fetchFn(url, {
			method: "PUT",
			headers,
			body: JSON.stringify(body),
		});

		if (!putRes.ok) {
			const err = (await putRes.json()) as { message?: string };
			const msg = `failed to push ${file.path}: ${err.message ?? putRes.status}`;
			print(`  ✗ ${msg}`);
			return { status: "fail", created, updated, unchanged, message: msg };
		}

		print(`  ✓ ${verb} ${file.path}`);
		if (existingSha) { updated++; } else { created++; }
	}

	const changed = created + updated;
	print("");
	print(`  ${created} created, ${updated} updated, ${unchanged} unchanged`);

	// Open a PR from `branch` → default branch when requested and there were changes.
	let prUrl: string | undefined;
	if (branch && createPr && changed > 0 && !dryRun) {
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
			// "A pull request already exists" is not an error — the branch was updated, PR just needs merging.
			const alreadyExists = err.errors?.some((e) => e.message.includes("already exists"));
			if (alreadyExists) {
				print(`  → PR already open for ${branch} — branch updated, ready to merge`);
			} else {
				print(`  ⚠ PR creation failed: ${err.message ?? prRes.status}`);
			}
		}
	}

	return { status: dryRun ? "dry-run" : "ok", created, updated, unchanged, prUrl };
}
