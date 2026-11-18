import { appendFileSync } from "node:fs";

import { createEnvLookup, type EnvLookup } from "@theholocron/env-utils/lookup";

/**
 * Appends Markdown to the file GitHub Actions names in `GITHUB_STEP_SUMMARY`, so the job's page says what happened.
 * Does nothing outside Actions (the variable is unset) and never throws: a summary that cannot be written must not
 * fail a publish. Returns whether the text was written.
 */
export function writeJobSummary(
	markdown: string,
	env: EnvLookup = createEnvLookup(),
	append: (file: string, text: string) => void = appendFileSync
): boolean {
	const file = env.get("GITHUB_STEP_SUMMARY");
	if (file === undefined) return false;
	try {
		append(file, `${markdown}\n`);
		return true;
	} catch {
		return false;
	}
}
