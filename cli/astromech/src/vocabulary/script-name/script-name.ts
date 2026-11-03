/**
 * The npm script spelling of a task id: a hyphen compound takes a colon (`deploy-preview` is the script
 * `deploy:preview`), because `deploy:preview` reads as a variant of `deploy` the way `test:watch` does. Every other id
 * is its own script name, and only an id that has a script needs it (`check-tokens` and `release` have none).
 */
export function scriptName(id: string): string {
	return id.includes(":") ? id : id.replace("-", ":");
}
