import { ProviderApiError } from "@theholocron/http-client";

import { decodeContents } from "../../../utils/index.js";
import type {
	NewPublicPackage,
	ValidateDocsPresenceInput,
	ValidateDocsPresenceResult,
} from "./validate-docs-presence.type.js";

const NEW_PACKAGE_ENTRY = /^(packages|plugins)\/([^/]+)\/src\/index\.ts$/;

/** `true` for any file the script counts as documentation. */
export function isDocsFile(path: string): boolean {
	return path.startsWith("docs/") || path.endsWith(".md") || path.endsWith(".mdx");
}

export async function validateDocsPresence(input: ValidateDocsPresenceInput): Promise<ValidateDocsPresenceResult> {
	const { client, repo, pullNumber, ref } = input;
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);

	const newPackages: NewPublicPackage[] = [];
	for (const file of changedFiles) {
		if (file.status !== "added") continue;
		const match = NEW_PACKAGE_ENTRY.exec(file.filename);
		if (!match) continue;
		const [, root, name] = match;

		let pkg: { private?: unknown };
		try {
			const contents = await client.git.getContents(repo, `${root}/${name}/package.json`, ref);
			pkg = JSON.parse(decodeContents(contents.content)) as { private?: unknown };
		} catch (err) {
			// No package.json (404) or one that isn't JSON: not a publishable
			// package — the script skips these the same way. Anything else
			// (auth, rate limit, 5xx) is a real failure, not a skip.
			if (err instanceof SyntaxError || (err instanceof ProviderApiError && err.status === 404)) continue;
			throw err;
		}
		if (!pkg.private) newPackages.push({ name, entry: file.filename });
	}

	const hasDocsChange = changedFiles.some((f) => isDocsFile(f.filename));
	return { newPackages, hasDocsChange, valid: newPackages.length === 0 || hasDocsChange };
}
