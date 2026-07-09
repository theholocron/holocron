import { ACTIONS, REUSABLE_WORKFLOWS } from "../templates/index.js";
import { WORKFLOW_HEADER, WORKFLOW_TEMPLATES } from "./setup-workflows.js";

const DEFAULT_REPO = "theholocron/.github";
const API_BASE = "https://api.github.com";

export type SyncGithubStatus = "ok" | "fail" | "dry-run";

export interface RunSyncGithubInput {
	/** GitHub personal access token with repo write access. */
	token: string;
	/** Target org/repo. Defaults to "theholocron/.github". */
	repo?: string;
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

function buildBatch(): FileBatch {
	const files: FileBatch = [];

	// Composite actions → .github/actions/<name>/action.yml
	for (const [name, content] of Object.entries(ACTIONS)) {
		files.push({
			path: `.github/actions/${name}.yml`,
			content: reusableHeader(`packages/cli/src/templates/index.ts`) + content,
		});
	}

	// Reusable workflows → .github/workflows/<name>.yml
	for (const [name, content] of Object.entries(REUSABLE_WORKFLOWS)) {
		files.push({
			path: `.github/workflows/${name}.yml`,
			content: reusableHeader(`packages/cli/src/templates/index.ts`) + content,
		});
	}

	// Thin callers → workflow-templates/<name>.yml
	for (const [name, content] of Object.entries(WORKFLOW_TEMPLATES)) {
		files.push({
			path: `workflow-templates/${name}.yml`,
			content: thinCallerHeader() + content,
		});
	}

	return files;
}

export async function runSyncGithub(input: RunSyncGithubInput): Promise<SyncGithubReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const repo = input.repo ?? DEFAULT_REPO;
	const [owner, repoName] = repo.split("/");
	const { token, dryRun = false } = input;
	const message = input.message ?? `chore: sync from theholocron/holocron`;
	const fetchFn = input.fetch ?? globalThis.fetch;

	const headers = {
		Authorization: `Bearer ${token}`,
		Accept: "application/vnd.github+json",
		"Content-Type": "application/json",
		"X-GitHub-Api-Version": "2022-11-28",
	};

	print(`holocron sync-github${dryRun ? " (dry-run)" : ""}`);
	print(`  repo: ${repo}`);
	print("");

	const batch = buildBatch();
	let created = 0;
	let updated = 0;
	let unchanged = 0;

	for (const file of batch) {
		const url = `${API_BASE}/repos/${owner}/${repoName}/contents/${file.path}`;
		const newContent = Buffer.from(file.content, "utf8").toString("base64");

		// Fetch existing file to get its SHA (needed for updates) and content (to detect no-op).
		let existingSha: string | undefined;
		let existingContent: string | undefined;
		try {
			const getRes = await fetchFn(url, { headers });
			if (getRes.ok) {
				const data = (await getRes.json()) as { sha: string; content: string };
				existingSha = data.sha;
				existingContent = data.content.replace(/\n/g, "");
			}
		} catch {
			// Network error — surface below
		}

		// Skip if content is identical.
		if (existingContent === newContent) {
			print(`  · unchanged  ${file.path}`);
			unchanged++;
			continue;
		}

		const verb = existingSha ? "updated " : "created ";
		if (dryRun) {
			print(`  ~ ${verb} ${file.path}`);
			existingSha ? updated++ : created++;
			continue;
		}

		const body: Record<string, unknown> = { message, content: newContent };
		if (existingSha) body.sha = existingSha;

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
		existingSha ? updated++ : created++;
	}

	print("");
	print(`  ${created} created, ${updated} updated, ${unchanged} unchanged`);
	return { status: dryRun ? "dry-run" : "ok", created, updated, unchanged };
}
