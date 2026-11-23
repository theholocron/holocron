import { ConfigError } from "@theholocron/kyber/config";

import type { OrgIssueType } from "../config/index.js";

/** The colour words GitHub's issue Types take. */
export const ISSUE_TYPE_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "pink", "purple"] as const;

/** The Conventional Commit types a Type's `commit` may name (the ones `start work` and commitlint know). */
export const COMMIT_TYPES = [
	"feat",
	"fix",
	"chore",
	"docs",
	"refactor",
	"perf",
	"test",
	"ci",
	"build",
	"style",
	"revert",
] as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const KEYS = ["name", "description", "color", "enabled", "label", "commit"];

/**
 * Checks the organization's `issueTypes` list (spec `tech-org-issue-types`, #2512) and returns it. `at` names where it
 * came from (`.holocron/org.ts` or `issueTypes`) so the error says which file to fix. A name that repeats ignoring
 * case, a `color` that is not one of GitHub's eight words, a `commit` that is not a Conventional Commit type, a key
 * the list does not know or a value that is not text is a {@link ConfigError} naming the entry.
 */
export function validateIssueTypes(value: unknown, at = "issueTypes"): OrgIssueType[] {
	if (!Array.isArray(value)) throw new ConfigError(`${at} must be a list of { name, description?, color?, ... }`);
	const seen = new Set<string>();
	return value.map((entry: unknown, index) => {
		const where = `${at}[${index}]`;
		if (!isObject(entry)) throw new ConfigError(`${where} must be an object with a "name"`);
		for (const key of Object.keys(entry)) {
			if (!KEYS.includes(key))
				throw new ConfigError(`${where}: "${key}" is not an issue Type option. Known: ${KEYS.join(", ")}`);
		}
		const { name, description, color, enabled, label, commit } = entry;
		if (typeof name !== "string" || name.trim() === "")
			throw new ConfigError(`${where}: "name" must be a non-empty string`);
		const key = name.trim().toLowerCase();
		if (seen.has(key))
			throw new ConfigError(
				`${where}: the name "${name}" repeats an earlier Type (names are compared ignoring case)`
			);
		seen.add(key);
		for (const [option, text] of [
			["description", description],
			["label", label],
		] as const) {
			if (text !== undefined && (typeof text !== "string" || text.trim() === "")) {
				throw new ConfigError(`${where}: "${option}" must be a non-empty string`);
			}
		}
		if (color !== undefined && !ISSUE_TYPE_COLORS.includes(color as (typeof ISSUE_TYPE_COLORS)[number])) {
			throw new ConfigError(
				`${where}: "color" must be one of ${ISSUE_TYPE_COLORS.join(", ")}, got ${JSON.stringify(color)}`
			);
		}
		if (commit !== undefined && !COMMIT_TYPES.includes(commit as (typeof COMMIT_TYPES)[number])) {
			throw new ConfigError(
				`${where}: "commit" must be a Conventional Commit type (${COMMIT_TYPES.join(", ")}), got ${JSON.stringify(commit)}`
			);
		}
		if (enabled !== undefined && typeof enabled !== "boolean")
			throw new ConfigError(`${where}: "enabled" must be true or false`);
		return {
			name: name.trim(),
			...(description !== undefined ? { description: description as string } : {}),
			...(color !== undefined ? { color: color as string } : {}),
			...(enabled !== undefined ? { enabled } : {}),
			...(label !== undefined ? { label: label as string } : {}),
			...(commit !== undefined ? { commit: commit as string } : {}),
		};
	});
}
