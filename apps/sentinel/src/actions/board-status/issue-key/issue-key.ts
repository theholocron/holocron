/**
 * An issue's key as the `projects` provider spells it: `#N` in the repository the provider is configured for,
 * `owner/repo#N` anywhere else (the GitHub provider's own rule, so a key made here matches a key it returns).
 */
export function issueKey(repo: string, number: number, home: string): string {
	return repo.toLowerCase() === home.toLowerCase() ? `#${number}` : `${repo}#${number}`;
}
