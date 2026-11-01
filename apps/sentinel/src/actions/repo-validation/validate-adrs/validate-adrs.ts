import { checkSpecs, classifySpecPath } from "@theholocron/astromech/repo-validation";

import { decodeContents } from "../../../utils/index.js";
import type { ValidateAdrsInput, ValidateAdrsResult } from "./validate-adrs.type.js";

/**
 * Validates the frontmatter of the ADRs and specs a pull request touches (holocron#913, #929). The rules are
 * `checkSpecs()` in `@theholocron/astromech/repo-validation`, the same ones `holocron probe specs check` runs on the
 * whole tree in CI; this is only the adapter that fetches each changed file's text at the PR's own ref through the
 * GitHub client. A removed file is not read, and a file that is neither an ADR nor a spec is left alone.
 */
export async function validateAdrs(input: ValidateAdrsInput): Promise<ValidateAdrsResult> {
	const { client, repo, pullNumber, ref } = input;
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);

	const files = [];
	for (const { filename, status } of changedFiles) {
		if (status === "removed" || !classifySpecPath(filename)) continue;
		const contents = await client.git.getContents(repo, filename, ref);
		files.push({ path: filename, text: decodeContents(contents.content) });
	}

	const { fileCount, findings } = checkSpecs(files);
	return { valid: findings.length === 0, fileCount, messages: findings };
}
