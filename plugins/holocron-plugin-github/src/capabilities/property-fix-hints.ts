/** GitHub's wording when a custom property value is not one the organization's definition allows. */
const NOT_ALLOWED = /Value '([^']+)' is not allowed for property '([^']+)'/g;

/**
 * What to do about each value GitHub says an organization custom property does not allow, one sentence per property,
 * read from GitHub's own message so it works even when the organization's definitions cannot be read. The values
 * belong to the organization's definition, not to the repository, so the fix is to add them there: a repository cannot
 * make its own value allowed. Empty when GitHub's message names no such value.
 */
export function propertyFixHints(githubMessage: string): string[] {
	const byProperty = new Map<string, string[]>();
	for (const [, value, property] of githubMessage.matchAll(NOT_ALLOWED)) {
		const values = byProperty.get(property as string) ?? [];
		if (!values.includes(value as string)) values.push(value as string);
		byProperty.set(property as string, values);
	}
	return [...byProperty].map(
		([property, values]) =>
			`add ${values.map((v) => `"${v}"`).join(", ")} to the allowed values of the organization custom property ${property} (the organization's Settings, Custom properties), then run setup again`
	);
}
