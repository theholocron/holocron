import type { RepoSecretsSync } from "../../config/index.js";

/**
 * Merge two lists of `repo.secrets.sync` entries. An entry is the same sync when its environment and scope match;
 * the keys then add up, and an entry that names no keys (every key the vault holds) stays that way.
 */
export function mergeSync(a: RepoSecretsSync[] | undefined, b: RepoSecretsSync[] | undefined): RepoSecretsSync[] {
	const merged = new Map<string, RepoSecretsSync>();
	for (const entry of [...(a ?? []), ...(b ?? [])]) {
		const id = `${entry.environment}\0${entry.scope ?? "repo"}`;
		const have = merged.get(id);
		merged.set(
			id,
			have
				? {
						...have,
						...(have.keys && entry.keys
							? { keys: [...new Set([...have.keys, ...entry.keys])] }
							: { keys: undefined }),
					}
				: { ...entry }
		);
	}
	return [...merged.values()].map(({ keys, ...rest }) => (keys ? { ...rest, keys } : rest));
}
