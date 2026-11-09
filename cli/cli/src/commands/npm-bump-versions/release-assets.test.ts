import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

/** The folders whose public packages the repo-wide release bumps: not a group's, and not `docs`/`apps` (private). */
const BUMPED_FOLDERS = ["cli", "plugins"];

describe("the repo-wide release commit", () => {
	const config = readFileSync(join(root, "release.config.ts"), "utf8");
	const assets = /assets: \[([^\]]*)\]/.exec(config)?.[1] ?? "";

	it.each(BUMPED_FOLDERS)("stages the version `bump-versions` writes in %s/*", (folder) => {
		const packages = readdirSync(join(root, folder), { withFileTypes: true }).filter((entry) =>
			entry.isDirectory()
		);
		const publicPackages = packages.filter(
			(entry) =>
				!(
					JSON.parse(readFileSync(join(root, folder, entry.name, "package.json"), "utf8")) as {
						private?: boolean;
					}
				).private
		);
		expect(publicPackages.length).toBeGreaterThan(0);
		expect(assets).toContain(`"${folder}/*/package.json"`);
	});
});
