import { describe, expect, it } from "vitest";

/**
 * Importing `./index.js` loads Sentinel's whole module graph (eslint and its
 * plugin bundles, alex, prettier, markdownlint, …) — ~2.5 s on its own,
 * half of vitest's 5 s default, and well past it once `holocron ci` runs
 * every workspace's tests in parallel under coverage. Gives this one test
 * room instead of letting it fail under load.
 */
const FULL_GRAPH_IMPORT_TIMEOUT_MS = 30_000;

describe("@theholocron/sentinel", () => {
	it(
		"imports cleanly (scaffolding only — see .notes/tech-sentinel-v1.spec.md)",
		async () => {
			await expect(import("./index.js")).resolves.toBeDefined();
		},
		FULL_GRAPH_IMPORT_TIMEOUT_MS
	);
});
