import { TASKS } from "../../registry/index.js";
import { legacyName } from "../legacy-name/index.js";
import { LEGACY_NAMES, type LegacyTarget } from "../legacy-names/index.js";

/** A flat id: a registry task, or a workflow-only key (`label`) that only the old-name table lists. */
function isFlatId(name: string): boolean {
	return TASKS[name] !== undefined || legacyName(name) !== undefined;
}

/**
 * The flat ids a name written in a manifest, a script or on the command line stands for, in run order: a flat id (or
 * its hyphen compound in the script spelling, `deploy:preview`) stands for itself, an old dotted name for its
 * successors (`sourceQuality.formatting` for three), anything else for none. A suite name is not a task and resolves to
 * none.
 */
export function resolveTaskName(name: string): LegacyTarget[] {
	if (isFlatId(name)) return [{ id: name }];
	const legacy = LEGACY_NAMES[name];
	if (legacy) return legacy;
	// `deploy:preview` is the script spelling of the id `deploy-preview`.
	const hyphenated = name.replace(":", "-");
	return isFlatId(hyphenated) ? [{ id: hyphenated }] : [];
}
