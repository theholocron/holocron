import { describe, expect, it } from "vitest";

import { ALEX_CONFIG } from "./alex-config.js";

describe("ALEX_CONFIG", () => {
	it("is the real canonical allow-list, not a placeholder", () => {
		expect(ALEX_CONFIG.allow).toEqual(expect.arrayContaining(["hook", "host-hostess", "husky"]));
		expect(Array.isArray(ALEX_CONFIG.allow)).toBe(true);
	});

	it("lets the Postman tool's name through, which alex reads as a job title", () => {
		expect(ALEX_CONFIG.allow).toContain("postman-postwoman");
	});
});
