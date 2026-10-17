import { ProviderApiError } from "@theholocron/http-client";

import { decodeContents } from "../../../utils/index.js";
import type { CheckedPackage, ValidateRegistryInput, ValidateRegistryResult } from "./validate-registry.type.js";

const PACKAGE_MANIFEST = /^(?:packages|plugins)\/[^/]+\/package\.json$/;

function nameLine(text: string): number {
	const index = text.split("\n").findIndex((l) => /^\s*"name"\s*:/.test(l));
	return index === -1 ? 1 : index + 1;
}

export async function validateRegistry(input: ValidateRegistryInput): Promise<ValidateRegistryResult> {
	const { client, repo, pullNumber, ref, loadRegistry } = input;
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);

	const checked: CheckedPackage[] = [];
	for (const file of changedFiles) {
		if (file.status === "removed" || !PACKAGE_MANIFEST.test(file.filename)) continue;
		let text: string;
		let pkg: { name?: unknown; private?: unknown };
		try {
			text = decodeContents((await client.git.getContents(repo, file.filename, ref)).content);
			pkg = JSON.parse(text) as { name?: unknown; private?: unknown };
		} catch (err) {
			// Missing (404) or not JSON: skipped, like the script. Anything
			// else (auth, rate limit, 5xx) is a real failure.
			if (err instanceof SyntaxError || (err instanceof ProviderApiError && err.status === 404)) continue;
			throw err;
		}
		if (!pkg.private && typeof pkg.name === "string") {
			checked.push({ name: pkg.name, file: file.filename, line: nameLine(text) });
		}
	}

	if (checked.length === 0) return { checked, missing: [], valid: true };

	const registry = await loadRegistry();
	const missing = checked.filter((p) => !registry.packages.has(p.name));
	return { checked, missing, registryVersion: registry.version, valid: missing.length === 0 };
}
