/**
 * Why GitHub would refuse `name` as an Actions secret or variable name, or `undefined` when it would accept it.
 *
 * GitHub's rules (the same for repository, environment and organization secrets and variables): letters, digits and
 * underscores only, no spaces, not starting with a digit, and not starting with `GITHUB_` (reserved, in any case).
 * A name that breaks one gets a bare 422 from the API, which no retry can fix, so the sync checks first.
 *
 * @param name - The secret or variable name.
 */
export function githubNameProblem(name: string): string | undefined {
	if (name === "") return "GitHub names cannot be empty";
	if (!/^[A-Za-z0-9_]+$/.test(name)) return "GitHub names may only contain letters, digits and underscores";
	if (/^[0-9]/.test(name)) return "GitHub names cannot start with a number";
	if (/^GITHUB_/i.test(name)) return "GitHub reserves names starting with GITHUB_";
	return undefined;
}
