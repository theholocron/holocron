/**
 * The first non-empty value among `names` in `env` (the process environment when none is given). An empty string counts
 * as unset, so a blank `TOKEN=` line does not hide the next name.
 */
export function firstEnv(env: Record<string, string | undefined> | undefined, ...names: string[]): string | undefined {
	const source = env ?? process.env;
	for (const name of names) {
		const value = source[name];
		if (value) return value;
	}
	return undefined;
}
