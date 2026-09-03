import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("alexrc createConfig", () => {
	it("returns valid JSON with the allow list", () => {
		const out = createConfig();
		const parsed = JSON.parse(out);
		expect(parsed.allow).toContain("hooks");
		expect(parsed.allow).toContain("hook");
		expect(parsed.allow).toContain("husky");
	});

	it("ends with a trailing newline", () => {
		expect(createConfig()).toMatch(/\n$/);
	});
});
