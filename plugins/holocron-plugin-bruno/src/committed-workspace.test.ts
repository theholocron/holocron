import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BrunoTooling } from "./capabilities/tooling.js";

/** This repository's root: its real request files and its committed `.bruno/` workspace are compared, not copies. */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

describe("the committed .bruno/ workspace", () => {
	it("is what the repo's request files generate, so `holocron sync requests` has nothing to write", async () => {
		const result = await new BrunoTooling({ repoRoot: REPO_ROOT, workspaceName: "The Holocron" }).workspace({
			collectionFiles: ["apps/sentinel/api/webhook.collection.json", "apps/comlink/src/worker.collection.json"],
			envFiles: [
				"apps/sentinel/api/webhook.environment.json",
				"apps/sentinel/api/webhook.environment.dev.json",
				"apps/sentinel/api/webhook.environment.prod.json",
				"apps/comlink/src/worker.environment.json",
			],
			repoRoot: REPO_ROOT,
			dryRun: true,
		});
		const stale = result.files
			.filter((file) => file.state !== "unchanged")
			.map((file) => `${file.state} ${file.path}`);
		expect(stale, "run `pnpm exec holocron sync requests --yes` and commit .bruno/").toEqual([]);
		expect(result.files.length).toBeGreaterThan(0);
	});
});
