import { workflowFile } from "@theholocron/ci";

import { LEGACY_NAMES } from "../legacy-names/index.js";

/** Each flat reusable file name and the old file name it replaced: the file of the first successor of an old name. */
const BY_FLAT_FILE = new Map<string, string>(
	Object.entries(LEGACY_NAMES).flatMap(([legacy, targets]) =>
		targets.slice(0, 1).map(({ id }) => [workflowFile(id), `${legacy}.yml`] as const)
	)
);

/**
 * The old file name of a flat reusable workflow — `test-unit.yml` is `verification.unitTests.yml`. The frozen copies in
 * `theholocron/.github` keep the old names and exist only there, so the path of a frozen copy, and of a workflow that
 * is still dispatched there by name, is spelled with it (spec `ci-flat-task-vocabulary`). A file with no old name
 * (`preview.yml`, `ci.yml`) is returned as it is.
 */
export function legacyFile(file: string): string {
	return BY_FLAT_FILE.get(file) ?? file;
}
