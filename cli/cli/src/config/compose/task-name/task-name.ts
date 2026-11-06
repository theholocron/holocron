import { resolveTaskName } from "@theholocron/astromech";

import type { TaskEntry } from "../compose.type.js";

/**
 * The key a task entry merges under. A name that stands for exactly one flat id (the id itself, or an old dotted
 * alias such as `verification.unitTests`) keys by that id, so the alias overrides the preset's entry instead of
 * sitting next to it; a name that stands for several ids or none (a suite, an unknown name) keys by itself.
 */
export function taskName(e: TaskEntry): string {
	const name = typeof e === "string" ? e : e.name;
	const resolved = resolveTaskName(name);
	return resolved.length === 1 ? resolved[0].id : name;
}
