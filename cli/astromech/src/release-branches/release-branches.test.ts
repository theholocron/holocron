import { describe, expect, it } from "vitest";

import { PRERELEASE_CHANNEL, RELEASE_BRANCHES } from "./release-branches.js";

describe("release branches", () => {
	it("releases from main and alpha", () => {
		expect([...RELEASE_BRANCHES]).toEqual(["main", "alpha"]);
	});

	it("publishes prereleases from one of the release branches", () => {
		expect(PRERELEASE_CHANNEL).toBe("alpha");
		expect(RELEASE_BRANCHES).toContain(PRERELEASE_CHANNEL);
	});
});
