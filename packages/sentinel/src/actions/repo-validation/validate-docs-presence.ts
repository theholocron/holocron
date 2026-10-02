/**
 * Flags a PR that adds a new public package without any docs change — the
 * Sentinel port of `platform.repoValidation`'s `Validate docs presence` CI
 * job (`scripts/validate-docs-presence.mjs`, holocron#913).
 *
 * The heuristic is the script's own:
 * - **A new public package** is an *added* `packages/<name>/src/index.ts`
 *   whose `packages/<name>/package.json` (read at the PR's head ref) isn't
 *   `"private": true`.
 * - **A docs change** is any changed file under `docs/`, or any `.md` /
 *   `.mdx` file anywhere.
 *
 * Advisory only, like the script, which always exits 0 so it never blocks an
 * emergency fix. `post-docs-presence-check.ts` turns a finding into a
 * `neutral` check with an annotation, never a `failure`.
 *
 * No git diff needed: the script diffs `BASE_SHA..HEAD` in a checkout, but
 * the PR's own file list from `pulls.listFiles()` already carries each
 * file's `status` (`added`, `modified`, …), which is all the heuristic reads.
 */

import type { GitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

import { decodeContents } from "../../utils/decode-contents.js";

const NEW_PACKAGE_ENTRY = /^packages\/([^/]+)\/src\/index\.ts$/;

export interface ValidateDocsPresenceInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each new package's `package.json` there. */
	ref: string;
}

export interface NewPublicPackage {
	/** The `packages/<name>` directory name. */
	name: string;
	/** The added entry point, `packages/<name>/src/index.ts` — where the check's annotation anchors. */
	entry: string;
}

export interface ValidateDocsPresenceResult {
	/** New public packages this PR adds. Empty when it adds none. */
	newPackages: NewPublicPackage[];
	/** Whether the PR changes anything under `docs/` or any `.md` / `.mdx` file. */
	hasDocsChange: boolean;
	/** `true` unless the PR adds a public package without any docs change. */
	valid: boolean;
}

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
		const name = NEW_PACKAGE_ENTRY.exec(file.filename)?.[1];
		if (!name) continue;

		let pkg: { private?: unknown };
		try {
			const contents = await client.git.getContents(repo, `packages/${name}/package.json`, ref);
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
