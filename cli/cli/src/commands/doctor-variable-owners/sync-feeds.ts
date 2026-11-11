import { resolvedEnvironment, type ResolvedHolocronConfig } from "../../config/index.js";
import { parseScope } from "../secrets-sync/parse-scope/index.js";
import type { SyncFeed } from "./doctor-variable-owners.type.js";
import { feedKey } from "./feed-key.js";

/**
 * The Environments that fill GitHub places, from `repo.secrets.sync` and `repo.variables.sync`: the one allowed copy of
 * a name. An entry whose scope does not parse is left out (`doctor secrets` reports it).
 */
export function syncFeeds(config: ResolvedHolocronConfig): SyncFeed[] {
	const feeds: SyncFeed[] = [];
	const add = (
		kind: "secrets" | "variables",
		entries: Array<{ environment?: string; layer?: string; keys?: string[]; scope?: string }>
	) => {
		for (const entry of entries) {
			try {
				const target = feedKey(kind, parseScope(entry.scope ?? "repo"));
				feeds.push({
					environment: resolvedEnvironment(entry),
					target,
					...(entry.keys ? { keys: entry.keys } : {}),
				});
			} catch {
				// A scope that does not parse names no place to compare.
			}
		}
	};
	add("secrets", config.repo?.secrets?.sync ?? []);
	add("variables", config.repo?.variables?.sync ?? []);
	return feeds;
}
