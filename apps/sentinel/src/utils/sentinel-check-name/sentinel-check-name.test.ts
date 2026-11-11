import { describe, expect, it } from "vitest";

import { SENTINEL_CHECK_PREFIX, sentinelCheckName } from "./sentinel-check-name.js";

describe("sentinelCheckName", () => {
	it("puts the prefix and the task id before the action, joined by one ' / '", () => {
		expect(sentinelCheckName("lint:code", "Run eslint")).toBe("sentinel:lint:code / Run eslint");
	});

	it("builds the name from the one prefix constant", () => {
		expect(sentinelCheckName("typecheck", "Run tsc --noEmit")).toBe(
			`${SENTINEL_CHECK_PREFIX}typecheck / Run tsc --noEmit`
		);
	});
});
