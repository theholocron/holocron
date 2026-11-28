import { TASKS } from "../../registry/index.js";
import { LEGACY_NAMES } from "../legacy-names/index.js";

/**
 * Every task name a manifest may list: the flat ids of the registry, the workflow-only ids (`label`, `greet`), and the
 * old dotted names that are still accepted. What a config validator checks a `tasks:` entry against.
 */
export const KNOWN_TASKS: ReadonlySet<string> = new Set([
	...Object.keys(TASKS),
	...Object.keys(LEGACY_NAMES),
	...Object.values(LEGACY_NAMES).flatMap((targets) => targets.map((target) => target.id)),
]);
