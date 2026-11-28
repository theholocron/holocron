import { ConfigError } from "@theholocron/kyber/config";

/**
 * Checks `repo.requiredChecks`, the list of status-check contexts a `strict` ruleset requires, when a repo writes it down
 * (`.holocron/repo.ts`) instead of leaving `holocron setup` to derive it from the tasks. Each entry is the context as GitHub
 * shows it (`test:unit / Run unit tests and collect coverage`), so a blank one, a non-string and a repeat are errors named
 * by position. An empty list is refused too: a ruleset that requires nothing is `protection: "none"`, not this.
 */
export function validateRequiredChecks(checks: unknown): void {
	if (checks === undefined) return;
	if (!Array.isArray(checks) || checks.length === 0) {
		throw new ConfigError("`repo.requiredChecks` is a non-empty list of status-check contexts");
	}
	const seen = new Set<string>();
	checks.forEach((context: unknown, index) => {
		const at = `\`repo.requiredChecks[${index}]\``;
		if (typeof context !== "string" || context.trim() === "") {
			throw new ConfigError(`${at} needs a status-check context, such as "typecheck / Run typecheck"`);
		}
		if (seen.has(context)) throw new ConfigError(`${at}: "${context}" is listed twice`);
		seen.add(context);
	});
}
