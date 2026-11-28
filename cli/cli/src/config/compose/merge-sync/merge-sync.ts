/** The fields of a `repo.secrets.sync` or `repo.variables.sync` entry that decide whether two are the same sync. */
interface SyncEntry {
	environment?: string;
	layer?: string;
	scope?: string;
	keys?: string[];
}

/**
 * Merge two lists of `repo.secrets.sync` (or `repo.variables.sync`) entries. An entry is the same sync when its
 * environment and scope match; the keys then add up, and an entry that names no keys (every key the vault holds) stays
 * that way.
 */
export function mergeSync<T extends SyncEntry>(a: T[] | undefined, b: T[] | undefined): T[] {
	const merged = new Map<string, T>();
	for (const entry of [...(a ?? []), ...(b ?? [])]) {
		const id = JSON.stringify([entry.environment, entry.layer, entry.scope ?? "repo"]);
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
	return [...merged.values()].map(({ keys, ...rest }) => (keys ? { ...rest, keys } : rest) as T);
}
