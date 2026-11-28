import { appendFileSync } from "node:fs";

import { createEnvLookup, type EnvLookup } from "@theholocron/env-utils/lookup";

/**
 * Appends `name=value` to the file GitHub Actions names in `GITHUB_OUTPUT`, so a later step reads it as
 * `steps.<id>.outputs.<name>`. Does nothing outside Actions (the variable is unset). Returns whether a line was written.
 */
export function writeStepOutput(
	name: string,
	value: string | number,
	env: EnvLookup = createEnvLookup(),
	append: (file: string, text: string) => void = appendFileSync
): boolean {
	const file = env.get("GITHUB_OUTPUT");
	if (file === undefined) return false;
	append(file, `${name}=${value}\n`);
	return true;
}
