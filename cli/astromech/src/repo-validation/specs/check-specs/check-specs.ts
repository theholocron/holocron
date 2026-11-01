import { classifySpecPath } from "../classify-spec-path/index.js";
import type { SpecFile, SpecsResult } from "../specs.type.js";
import { validateAdr } from "../validate-adr/index.js";
import { validateSpec } from "../validate-spec/index.js";

/**
 * The ADR and spec check over the files it is given: each one that is an ADR or a spec (see `classifySpecPath`) goes to
 * its rules, and every other file is skipped. Whoever calls it decides which files to read (the whole tree, a PR's
 * changed files) and supplies their text; nothing here touches the filesystem or the network.
 */
export function checkSpecs(files: readonly SpecFile[]): SpecsResult {
	const result: SpecsResult = { fileCount: 0, findings: [] };
	for (const { path, text } of files) {
		const kind = classifySpecPath(path);
		if (!kind) continue;
		result.fileCount++;
		result.findings.push(...(kind === "adr" ? validateAdr(path, text) : validateSpec(path, text)));
	}
	return result;
}
