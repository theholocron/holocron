import { ConfigError } from "@theholocron/kyber/config";

import type { RepoLabels } from "../config/index.js";

/** What an area name may be: the rest of `area:<name>`, so no colon, comma, space or leading symbol. */
const AREA_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** GitHub's longest label name is 50 characters, and `area:` takes five. */
const MAX_NAME = 45;

/** GitHub's longest label name. */
const MAX_LABEL = 50;

/** `owner/name`, as GitHub spells a repository. */
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Checks one label-to-Type table and records each label (lower case) in `seen`, so no label is in two tables. */
function validateKinds(
	key: "kinds" | "fallbackKinds",
	table: Record<string, string> | undefined,
	seen: Map<string, string>
): void {
	for (const [label, type] of Object.entries(table ?? {})) {
		const at = `\`repo.labels.${key}.${label}\``;
		if (label.trim() === "" || label.length > MAX_LABEL) {
			throw new ConfigError(`${at}: a label name is 1 to ${MAX_LABEL} characters`);
		}
		if (typeof type !== "string" || type.trim() === "") {
			throw new ConfigError(`${at} needs the name of an issue Type, such as "Bug"`);
		}
		const lower = label.toLowerCase();
		const first = seen.get(lower);
		if (first !== undefined) throw new ConfigError(`${at}: ${JSON.stringify(label)} is already in \`${first}\``);
		seen.set(lower, `repo.labels.${key}.${label}`);
	}
}

/**
 * Check `repo.labels` (spec `tech-github-area-labels`): each area name must be usable as the suffix of a label (letters,
 * digits, `.`, `_` and `-`, at most 45 characters) and appear once whatever the case (GitHub's labels are
 * case-insensitive), each area needs a list of patterns with at least one that includes a path, and each scope names a
 * declared area. `kinds` and `fallbackKinds` map a label name (at most 50 characters, in one table only) to a Type name,
 * and `repos` lists `owner/name` repositories; whether a Type exists is the organization's to say, so the probe checks it.
 *
 * @param labels - `repo.labels`, if the config has it.
 * @throws {ConfigError} Naming the path of the first problem found.
 */
export function validateRepoLabels(labels: RepoLabels | undefined): void {
	if (labels === undefined) return;
	const areas = labels.areas ?? {};
	const seen = new Map<string, string>();
	for (const [name, patterns] of Object.entries(areas)) {
		const at = `\`repo.labels.areas.${name}\``;
		if (!AREA_NAME.test(name) || name.length > MAX_NAME) {
			throw new ConfigError(
				`${at}: ${JSON.stringify(name)} cannot be the name of an \`area:<name>\` label (use letters, digits, ".", "_" or "-", at most ${MAX_NAME} characters)`
			);
		}
		const lower = name.toLowerCase();
		const first = seen.get(lower);
		if (first !== undefined)
			throw new ConfigError(`${at}: duplicates \`repo.labels.areas.${first}\` (label names ignore case)`);
		seen.set(lower, name);
		if (!Array.isArray(patterns) || patterns.length === 0) {
			throw new ConfigError(`${at} needs a list of folder patterns, got none`);
		}
		for (const pattern of patterns) {
			if (typeof pattern !== "string" || pattern.replace(/^!/, "").trim() === "") {
				throw new ConfigError(`${at} has an empty pattern`);
			}
		}
		if (patterns.every((p) => p.startsWith("!"))) {
			throw new ConfigError(`${at} has only exclusions ("!..."), so no path could be in it`);
		}
	}
	for (const [scope, area] of Object.entries(labels.scopes ?? {})) {
		const at = `\`repo.labels.scopes.${scope}\``;
		if (scope.trim() === "") throw new ConfigError("`repo.labels.scopes` has an empty scope name");
		if (typeof area !== "string" || !Object.hasOwn(areas, area)) {
			const known = Object.keys(areas);
			throw new ConfigError(
				`${at} names the unknown area ${JSON.stringify(area)}; ${known.length > 0 ? `the declared areas are ${known.join(", ")}` : "`repo.labels.areas` declares none"}`
			);
		}
	}
	const kinds = new Map<string, string>();
	validateKinds("kinds", labels.kinds, kinds);
	validateKinds("fallbackKinds", labels.fallbackKinds, kinds);
	const repos: unknown = labels.repos ?? [];
	if (!Array.isArray(repos)) throw new ConfigError("`repo.labels.repos` is a list of `owner/name` repositories");
	for (const repo of repos as unknown[]) {
		if (typeof repo !== "string" || !REPOSITORY.test(repo)) {
			throw new ConfigError(
				`\`repo.labels.repos\` has ${JSON.stringify(repo)}, which is not an \`owner/name\` repository`
			);
		}
	}
}
