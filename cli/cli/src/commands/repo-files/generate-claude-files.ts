import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { formatJson } from "@theholocron/astromech";
import { errorMessage } from "@theholocron/misc-utils";

import type { FailedRepoFile, GeneratedRepoFile, RepoFilesInput } from "./repo-files.type.js";
import { withDcgHook } from "./with-dcg-hook.js";

export const CLAUDE_SETTINGS_FILE = ".claude/settings.json";

/**
 * `.claude/settings.json` with the `dcg` `PreToolUse` hook, for a repo whose config opts in with `agent: ["claude", { dcg: true }]`. The file
 * already on disk is merged, so a repo's own `permissions` and hooks are kept; the same bytes come out of `setup` and
 * `sync`, and `probe generated check` fails when the hook is missing. A repo that does not opt in gets nothing (no
 * step, no file), so the repos that never used it are unchanged. A file that is not valid JSON, or has a shape that
 * cannot hold the hook, is a failed step naming the file; it is never overwritten.
 */
export async function generateClaudeFiles(input: RepoFilesInput): Promise<(GeneratedRepoFile | FailedRepoFile)[]> {
	if (input.loaded.resolved.agentOptions?.dcg !== true) return [];
	const step = `write ${CLAUDE_SETTINGS_FILE}`;
	const text = await readFile(join(input.repoRoot, CLAUDE_SETTINGS_FILE), "utf8").catch(() => undefined);
	let existing: unknown = {};
	if (text !== undefined) {
		try {
			existing = JSON.parse(text);
		} catch {
			return [{ kind: "error", step, syncStep: step, message: `${CLAUDE_SETTINGS_FILE} is not valid JSON` }];
		}
	}
	try {
		const content = formatJson(withDcgHook(existing));
		return [
			{ kind: "file", path: CLAUDE_SETTINGS_FILE, content, step, syncStep: step, note: "dcg PreToolUse hook" },
		];
	} catch (err) {
		return [{ kind: "error", step, syncStep: step, message: `${CLAUDE_SETTINGS_FILE}: ${errorMessage(err)}` }];
	}
}
