import { TASKS } from "../../registry/index.js";

/**
 * The suites the registry declares, in the order their first leaf appears: `test`, `lint` and `scan` today (`validate`
 * joins when it is split into `validate:specs` and `validate:docs`). A suite is declared by the `suite` field of its
 * leaves; it is never a task id.
 */
export const SUITES: readonly string[] = [
	...new Set(Object.values(TASKS).flatMap((def) => (def.suite ? [def.suite] : []))),
];

/** The leaf ids of a suite, in registry (run) order; empty for a name that is not a suite. */
export function suiteMembers(suite: string): string[] {
	return Object.entries(TASKS).flatMap(([id, def]) => (def.suite === suite ? [id] : []));
}
