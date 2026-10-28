import { describe, expect, it } from "vitest";

import { ALEX_CONFIG } from "./alex-config.js";

describe("ALEX_CONFIG", () => {
	it("is the real canonical allow-list, not a placeholder", () => {
		expect(ALEX_CONFIG.allow).toEqual(expect.arrayContaining(["hook", "husky"]));
		expect(Array.isArray(ALEX_CONFIG.allow)).toBe(true);
	});
});
