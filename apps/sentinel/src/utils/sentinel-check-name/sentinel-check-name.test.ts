import { describe, expect, it } from "vitest";

import { sentinelCheckName } from "./sentinel-check-name.js";

describe("sentinelCheckName", () => {
	it("puts the task id before the action, joined by one ' / ', with no prefix", () => {
		expect(sentinelCheckName("lint:markdown", "Run markdownlint")).toBe("lint:markdown / Run markdownlint");
	});

	it("keeps a colon id and an event suffix as they are", () => {
		expect(sentinelCheckName("validate:config", "Run Holocron config compatibility (pull_request)")).toBe(
			"validate:config / Run Holocron config compatibility (pull_request)"
		);
	});
});
