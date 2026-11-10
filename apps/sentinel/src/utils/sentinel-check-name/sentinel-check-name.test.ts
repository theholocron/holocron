import { describe, expect, it } from "vitest";

import { sentinelCheckName } from "./sentinel-check-name.js";

describe("sentinelCheckName", () => {
	it("joins the group and the action with one ' / '", () => {
		expect(sentinelCheckName("Static Analysis", "Run eslint")).toBe("Static Analysis / Run eslint");
	});
});
