/** The key a pull request's post is found by: `owner/repo#123`. */
export function prKey(repo: string, number: number): string {
	return `${repo}#${number}`;
}
