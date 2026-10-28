import { defineConfig } from "@theholocron/semantic-release-config";
import { describe, expect, it } from "vitest";

import { ungroupedReleaseConfig } from "./ungrouped-release-config.js";

type Config = { branches?: unknown; tagFormat?: string; plugins: (string | [unknown, Record<string, unknown>?])[] };
const options = { branches: ["main"], exec: { prepareCmd: "bump", publishCmd: "publish" } };

describe("ungroupedReleaseConfig", () => {
	it("is defineConfig() unchanged when there are no groups", () => {
		expect(ungroupedReleaseConfig({ groups: [], ...options })).toEqual(defineConfig(options));
	});

	it("keeps the repo's own tags, branches, changelog and release commit", () => {
		const config = ungroupedReleaseConfig({ groups: ["observability"], ...options }) as Config;
		const stock = defineConfig(options) as Config;
		expect(config.tagFormat).toBeUndefined();
		expect(config.branches).toEqual(stock.branches);
		expect(config.plugins.slice(2)).toEqual(stock.plugins.slice(2));
	});

	it("scopes the analyzer and notes generator to commits outside the groups, with the org's configuration", () => {
		const config = ungroupedReleaseConfig({ groups: ["observability"], ...options }) as Config;
		const stock = defineConfig(options) as Config;
		expect(config.plugins[0]).toEqual([
			expect.objectContaining({ analyzeCommits: expect.any(Function) }),
			(stock.plugins[0] as [unknown, unknown])[1],
		]);
		expect(config.plugins[1]).toEqual([
			expect.objectContaining({ generateNotes: expect.any(Function) }),
			(stock.plugins[1] as [unknown, unknown])[1],
		]);
	});

	it("passes the assets and exec options to defineConfig", () => {
		const config = ungroupedReleaseConfig({ groups: ["skills"], assets: ["CHANGELOG.md"], ...options }) as Config;
		const git = config.plugins.find((p) => Array.isArray(p) && p[0] === "@semantic-release/git") as [
			string,
			Record<string, unknown>,
		];
		expect(git[1]["assets"]).toEqual(["CHANGELOG.md"]);
		expect(config.plugins.find((p) => Array.isArray(p) && p[0] === "@semantic-release/exec")).toEqual([
			"@semantic-release/exec",
			options.exec,
		]);
	});
});
