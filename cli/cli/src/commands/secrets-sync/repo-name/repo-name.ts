/** `holocron` from `holocron` or `theholocron/holocron`: the config accepts both, the provider takes the name. */
export function repoName(repo: string): string {
	return repo.slice(repo.indexOf("/") + 1);
}
