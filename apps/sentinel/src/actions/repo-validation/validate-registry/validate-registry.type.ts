import type { GitHubClient } from "@theholocron/github-client";

import type { LatestRegistry } from "../load-latest-registry/index.js";

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
