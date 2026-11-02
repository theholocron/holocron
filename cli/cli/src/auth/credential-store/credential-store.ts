/**
 * The variables the `credentials` providers returned, kept for the life of the process.
 *
 * The plugin loader reads each provider once (`setCredentials`), and the token resolvers look a token up here
 * (`getCredential`) after the flag and the process environment and before the keyring. It is in memory only: the
 * values were already in this process when the provider returned them, and nothing here writes them anywhere.
 *
 * A source is one provider's answer for one environment. They are kept in the order they were set, which is the
 * order `holocron.config` lists the providers, and the first source that has a value wins.
 */

const sources = new Map<string, Record<string, string>>();

/** Remember `variables` as what the source `source` returned. Setting a source again replaces its variables. */
export function setCredentials(source: string, variables: Record<string, string>): void {
	sources.set(source, variables);
}

/** Whether the source `source` has been read already, so a second loader in the same process does not read it again. */
export function hasCredentials(source: string): boolean {
	return sources.has(source);
}

/**
 * The first non-empty value for any of `names`, from the first source that has one. Sources are tried in the order
 * they were set; within a source the names are tried in the order given (the project's own variable name before the
 * vendor's). `undefined` when no source has one.
 */
export function getCredential(...names: string[]): string | undefined {
	for (const variables of sources.values()) {
		for (const name of names) {
			const value = variables[name];
			if (value) return value;
		}
	}
	return undefined;
}

/** Forget every source. For tests, and for a process that wants the next load to read the providers again. */
export function clearCredentials(): void {
	sources.clear();
}
