import { classifySpecPath } from "../classify-spec-path/index.js";
import { parseFrontmatter } from "../parse-frontmatter/index.js";
import type { SpecFile, SpecsResult } from "../specs.type.js";
import { validateAdr } from "../validate-adr/index.js";
import { validateSpec } from "../validate-spec/index.js";

/**
 * The ADR and spec check over the files it is given: each one that is an ADR or a spec (see `classifySpecPath`) goes to
 * its rules, and every other file is skipped. Whoever calls it decides which files to read (the whole tree, a PR's
 * changed files) and supplies their text; nothing here touches the filesystem or the network.
 *
 * Beyond each file's own rules, two specs may not share an `id`: the later one, in the order given, is an error.
 */
export function checkSpecs(files: readonly SpecFile[]): SpecsResult {
	const result: SpecsResult = { fileCount: 0, findings: [] };
	const specIds = new Map<string, string>();
	for (const { path, text } of files) {
		const kind = classifySpecPath(path);
		if (!kind) continue;
		result.fileCount++;
		result.findings.push(...(kind === "adr" ? validateAdr(path, text) : validateSpec(path, text)));
		const id = kind === "spec" ? parseFrontmatter(text)?.get("id") : undefined;
		if (!id?.value) continue;
		const first = specIds.get(id.value);
		if (first === undefined) specIds.set(id.value, path);
		else {
			result.findings.push({
				file: path,
				line: id.line,
				rule: "id",
				reason: `id "${id.value}" is also the id of ${first}`,
				severity: "error",
			});
		}
	}
	return result;
}
