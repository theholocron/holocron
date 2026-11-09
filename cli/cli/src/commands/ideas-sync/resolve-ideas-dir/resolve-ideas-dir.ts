import { join } from "node:path";

import { holocronEnv } from "@theholocron/env-utils/lookup";

import type { IdeasConfig } from "../../../config/index.js";

/**
 * The folder of idea notes: `HOLOCRON_IDEAS_DIR` (then `IDEAS_DIR`) when set, else `ideas.dir` of the config.
 * A leading `~` is the home folder. `undefined` when neither names one.
 */
export function resolveIdeasDir(
	ideas: IdeasConfig | undefined,
	home: string,
	source?: Record<string, string | undefined>
): string | undefined {
	const dir = holocronEnv(source).get("IDEAS_DIR") ?? ideas?.dir;
	if (dir === undefined) return undefined;
	if (dir === "~") return home;
	return dir.startsWith("~/") ? join(home, dir.slice(2)) : dir;
}
