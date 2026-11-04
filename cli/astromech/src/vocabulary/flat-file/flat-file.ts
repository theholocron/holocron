import { workflowFile } from "@theholocron/ci";

import { LEGACY_NAMES } from "../legacy-names/index.js";

/** Each old reusable file name and the flat one that replaced it: the file of the first successor of an old name. */
const BY_LEGACY_FILE = new Map<string, string>(
	Object.entries(LEGACY_NAMES).flatMap(([legacy, targets]) =>
		targets.slice(0, 1).map(({ id }) => [`${legacy}.yml`, workflowFile(id)] as const)
	)
);

/**
 * The flat file name of a reusable workflow given by its old one — `verification.unitTests.yml` is `test-unit.yml`.
 * What a frozen copy in `theholocron/.github` is replaced by in `theholocron/holocron` (its deprecation notice names
 * it). A file already flat, or with no old name, is returned as it is.
 */
export function flatFile(file: string): string {
	return BY_LEGACY_FILE.get(file) ?? file;
}
