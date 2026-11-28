import { ADR_DIR, classifySpecPath, SPEC_DIRS } from "@theholocron/astromech/repo-validation";

import type { SpecDocument, SpecsSyncIo } from "./specs-sync.type.js";

/**
 * Every ADR and spec in the working tree, in path order: the files `specs check` checks, found the same way (`ADR_DIR`
 * and `SPEC_DIRS`, so a move of the ADRs is one constant). A file that cannot be read is left out.
 */
export function readDocuments(io: SpecsSyncIo): SpecDocument[] {
	return [ADR_DIR, ...SPEC_DIRS]
		.flatMap((dir) => io.list(dir).map((name) => `${dir}/${name}`))
		.sort()
		.flatMap((path) => {
			const kind = classifySpecPath(path);
			const text = kind ? io.read(path) : undefined;
			return kind && text !== undefined ? [{ path, kind, text }] : [];
		});
}
