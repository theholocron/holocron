/** The line that says how to fix a credentials path the version control ignore rules do not cover. */
export function ignoreAdvice(isDefault: boolean, choose: string): string {
	return isDefault
		? "the private directory's ignore rule is missing: run `holocron repo sync` to add it"
		: `add it to .gitignore, or ${choose}`;
}
