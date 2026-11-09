import { describe, expect, it } from "vitest";

import type { AlphaRelease } from "../alpha-release/index.js";
import { pinAlphaReleases } from "./pin-alpha-releases.js";

const lookupOf = (releases: Record<string, AlphaRelease>) => (name: string) => releases[name];

describe("pinAlphaReleases", () => {
	it("moves an own-scope alpha prerelease to the version npm's alpha tag points at", () => {
		const result = pinAlphaReleases(
			{ "@theholocron/cli": "5.0.0-alpha.394", "@theholocron/holocron-plugin-discord": "5.0.0-alpha.132" },
			lookupOf({
				"@theholocron/cli": { version: "5.0.0-alpha.393" },
				"@theholocron/holocron-plugin-discord": {
					version: "5.0.0-alpha.393",
					peerDependencies: { "@theholocron/cli": "5.0.0-alpha.393" },
				},
			})
		);
		expect(result.dependencies).toEqual({
			"@theholocron/cli": "5.0.0-alpha.393",
			"@theholocron/holocron-plugin-discord": "5.0.0-alpha.393",
		});
		expect(result.changes).toEqual([
			"@theholocron/cli 5.0.0-alpha.394 → 5.0.0-alpha.393",
			"@theholocron/holocron-plugin-discord 5.0.0-alpha.132 → 5.0.0-alpha.393",
		]);
		expect(result.mismatches).toEqual([]);
	});

	it("leaves a package that is outside the scope, not an alpha, or without an alpha tag alone", () => {
		const asked: string[] = [];
		const result = pinAlphaReleases(
			{
				yaml: "2.8.0-alpha.1",
				"@theholocron/holocron-config": "3.1.0",
				"@theholocron/no-tag": "1.0.0-alpha.4",
			},
			(name) => {
				asked.push(name);
				return undefined;
			}
		);
		expect(result.dependencies).toEqual({
			yaml: "2.8.0-alpha.1",
			"@theholocron/holocron-config": "3.1.0",
			"@theholocron/no-tag": "1.0.0-alpha.4",
		});
		expect(asked).toEqual(["@theholocron/no-tag"]);
		expect(result.changes).toEqual([]);
	});

	it("reports no change when the installed version already is the alpha tag", () => {
		const result = pinAlphaReleases(
			{ "@theholocron/cli": "5.0.0-alpha.393" },
			lookupOf({ "@theholocron/cli": { version: "5.0.0-alpha.393" } })
		);
		expect(result.changes).toEqual([]);
	});

	it("reports an exact peer that the staged set does not satisfy, and ignores ranges and unstaged peers", () => {
		const result = pinAlphaReleases(
			{ "@theholocron/cli": "5.0.0-alpha.393", "@theholocron/holocron-plugin-github": "5.0.0-alpha.132" },
			lookupOf({
				"@theholocron/cli": { version: "5.0.0-alpha.393" },
				"@theholocron/holocron-plugin-github": {
					version: "5.0.0-alpha.392",
					peerDependencies: {
						"@theholocron/cli": "5.0.0-alpha.392",
						"@theholocron/github-client": "1.2.3",
						"@theholocron/misc-utils": "^1.0.0",
					},
				},
			})
		);
		expect(result.mismatches).toEqual([
			"@theholocron/holocron-plugin-github@5.0.0-alpha.392 peers @theholocron/cli@5.0.0-alpha.392, but @theholocron/cli@5.0.0-alpha.393 is staged",
		]);
	});
});
