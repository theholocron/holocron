/**
 * `holocron lint commit-msg <file>` — a real programmatic replacement for
 * shelling out to `commitlint --edit "$1"` from `.husky/commit-msg`
 * (holocron#789). Matches that CLI's own contract exactly: `file` is a
 * path to the commit message being written (the arg git's `commit-msg`
 * hook passes as `$1`), no `--config` override needed — `@commitlint/load`
 * runs from `cwd` with no seed, so cosmiconfig's own normal upward search
 * discovers the invoking repo's real `commitlint.config.*` file, exactly
 * as `commitlint --edit` (no `--config` flag) already does today. Unlike
 * Sentinel's `loadIsolatedConfig()`, no isolation is needed here — this
 * runs inside a real repo checkout with a real `node_modules`, not
 * standalone on a server.
 */

import { readFile } from "node:fs/promises";

import load from "@commitlint/load";

import { type CommitMessageViolation, lintCommitMessage } from "./lint-message.js";

export interface LintCommitMsgFileResult {
	valid: boolean;
	violations: CommitMessageViolation[];
}

export async function lintCommitMsgFile(filePath: string, cwd = process.cwd()): Promise<LintCommitMsgFileResult> {
	const message = await readFile(filePath, "utf8");
	const loaded = await load({}, { cwd });
	const violations = await lintCommitMessage(message, loaded);
	return { valid: violations.length === 0, violations };
}
