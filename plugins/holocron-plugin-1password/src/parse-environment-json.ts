import type { EnvironmentEntry } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

/** The list in `op environment secret list --format=json`: a bare array, or an object that holds one. */
function entriesOf(parsed: unknown): unknown[] {
	if (Array.isArray(parsed)) return parsed;
	if (parsed && typeof parsed === "object") {
		const found = Object.values(parsed).find(Array.isArray);
		if (found) return found;
	}
	throw new ProviderApiError(
		"1Password returned an Environment listing in a shape this plugin does not know",
		502,
		undefined
	);
}

/**
 * Parse `op environment secret list --reveal --format=json` into entries that say whether each is concealed.
 *
 * Each entry carries a name (`name`, else `key`), a `value` and a boolean `concealed`. An entry with no name is
 * skipped; a missing value is empty; a `concealed` that is not `false` counts as concealed, because the safe side
 * of a comparison of secrets is to include it. The shape of `op`'s JSON is not documented here beyond those fields.
 */
export function parseEnvironmentJson(text: string): EnvironmentEntry[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new ProviderApiError("1Password returned an Environment listing that is not JSON", 502, undefined);
	}
	const out: EnvironmentEntry[] = [];
	for (const raw of entriesOf(parsed)) {
		if (!raw || typeof raw !== "object") continue;
		const entry = raw as Record<string, unknown>;
		const name = typeof entry.name === "string" ? entry.name : typeof entry.key === "string" ? entry.key : "";
		if (!name) continue;
		out.push({
			name,
			value: typeof entry.value === "string" ? entry.value : "",
			concealed: entry.concealed !== false,
		});
	}
	return out;
}
