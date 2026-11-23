import type { OrgIssueType } from "../../../config/index.js";
import type { IssueTypeInfo } from "../../../plugin/index.js";
import type { RepoCheckResult } from "../doctor-repo.type.js";

const lower = (value: string): string => value.toLowerCase();

/**
 * Compares the issue Types the org area declares with the organization's own (spec `tech-org-issue-types`, section 5).
 * Pure: names, descriptions and colour words only. A declared Type the organization lacks is the one problem
 * (`holocron apply issue-types` or `setup` makes it); everything else is an `info` note, never a failure, because a
 * description, colour or switch can be changed by a person on purpose and a Type nobody declared is not wrong. Names
 * match ignoring case; a field the declaration leaves out is not compared.
 */
export function compareIssueTypes(
	declared: readonly OrgIssueType[],
	actual: readonly IssueTypeInfo[]
): Extract<RepoCheckResult, { problems: string[] }> {
	const have = new Map(actual.map((t) => [lower(t.name), t]));
	const wanted = new Set(declared.map((t) => lower(t.name)));
	const problems: string[] = [];
	const info: string[] = [];

	for (const type of declared) {
		const found = have.get(lower(type.name));
		if (!found) {
			problems.push(
				`missing issue Type ${type.name}; run \`holocron apply issue-types\` (or \`holocron setup\`)`
			);
			continue;
		}
		if (type.description !== undefined && type.description !== (found.description ?? "")) {
			info.push(
				`${type.name} description was ${JSON.stringify(found.description ?? "")}, declared ${JSON.stringify(type.description)}; \`holocron apply issue-types --update\` sets it`
			);
		}
		if (type.color !== undefined && lower(type.color) !== lower(found.color ?? "")) {
			info.push(
				`${type.name} colour was ${found.color ?? "none"}, declared ${type.color}; \`holocron apply issue-types --update\` sets it`
			);
		}
		if (!found.enabled && type.enabled !== false) {
			info.push(`${type.name} is turned off in the organization's settings`);
		}
	}
	for (const type of actual) {
		if (!wanted.has(lower(type.name))) info.push(`${type.name} is not declared in \`issueTypes\``);
	}
	return { problems, checked: declared.length, info };
}
