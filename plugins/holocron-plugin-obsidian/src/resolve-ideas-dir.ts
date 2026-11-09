import { join } from "node:path";

import { holocronEnv } from "@theholocron/env-utils/lookup";

/**
 * The folder of idea notes: `HOLOCRON_IDEAS_DIR` (then `IDEAS_DIR`) when set, else the provider's `dir` option.
 * A leading `~` is the home folder. `undefined` when neither names one.
 */
export function resolveIdeasDir(
	dir: string | undefined,
	home: string,
	source?: Record<string, string | undefined>
): string | undefined {
	const chosen = holocronEnv(source).get("IDEAS_DIR") ?? dir;
	if (chosen === undefined) return undefined;
	if (chosen === "~") return home;
	return chosen.startsWith("~/") ? join(home, chosen.slice(2)) : chosen;
}
