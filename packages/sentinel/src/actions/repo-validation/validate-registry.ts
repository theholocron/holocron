/**
 * Checks that every public package a PR touches is in the latest published
 * `@theholocron/registry-doc` registry — the Sentinel port of
 * `platform.repoValidation`'s `Validate registry consistency` CI job
 * (`scripts/validate-registry.mjs`, holocron#925).
 *
 * The script's rule, scoped like every other Bucket 1 check: a package is
 * checked when its `packages/<name>/package.json` is added or modified in
 * the PR and, at the PR's head ref, has a `name` and isn't `private`. That
 * covers a new package, a rename and a private-to-public flip; an existing
 * gap in an untouched package isn't this PR's to fix (the CI job keeps
 * checking the whole tree until it's retired). Like the script, a
 * `package.json` that's missing or isn't JSON is skipped.
 *
 * The registry is only fetched when there's a public package to check, so
 * a PR that touches none never reaches npm. See `load-latest-registry.ts`
 * for why it's the latest release rather than the repo's pinned version.
 */

import type { GitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

import { decodeContents } from "../../utils/decode-contents.js";
import type { LatestRegistry } from "./load-latest-registry.js";

const PACKAGE_MANIFEST = /^packages\/[^/]+\/package\.json$/;

export interface ValidateRegistryInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed `package.json` there. */
	ref: string;
	/** Loads the registry; injected so the handler can pass `loadLatestRegistry` and tests a fake. */
	loadRegistry: () => Promise<LatestRegistry>;
}

export interface CheckedPackage {
	/** The package's npm name, e.g. `@theholocron/cli`. */
	name: string;
	/** The `package.json` path, where the check's annotation anchors. */
	file: string;
	/** 1-indexed line of the `"name"` field, or 1 when it can't be located. */
	line: number;
}

export interface ValidateRegistryResult {
	/** Public packages this PR touches. Empty when it touches none. */
	checked: CheckedPackage[];
	/** The subset of `checked` missing from the registry. */
	missing: CheckedPackage[];
	/** The registry-doc version compared against; absent when nothing needed checking. */
	registryVersion?: string;
	valid: boolean;
}

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
