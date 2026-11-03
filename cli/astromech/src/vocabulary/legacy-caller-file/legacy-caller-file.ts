import { legacyName } from "../legacy-name/index.js";

/**
 * The file name a thin caller of task `id` has while callers are legacy-named (see `legacyCaller`): the old task name
 * and `.yml`, `verification.unitTests.yml` for `test:unit`. An id with no old name (`preview`) keeps its own.
 */
export function legacyCallerFile(id: string): string {
	return `${legacyName(id) ?? id}.yml`;
}
