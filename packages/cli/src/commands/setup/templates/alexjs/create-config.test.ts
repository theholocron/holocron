import { describe, expect, it } from "vitest";

import { createIgnoreConfig, createRcConfig } from "./create-config.js";

describe("alexjs createRcConfig", () => {
	it("returns valid JSON with the allow list", () => {
		const parsed = JSON.parse(createRcConfig());
		expect(parsed.allow).toContain("hooks");
		expect(parsed.allow).toContain("hook");
		expect(parsed.allow).toContain("husky");
	});

	it("ends with a trailing newline", () => {
		expect(createRcConfig()).toMatch(/\n$/);
	});
});

describe("alexjs createIgnoreConfig", () => {
	it("ignores .github/ directory", () => {
		expect(createIgnoreConfig()).toContain(".github/*");
	});

	it("ignores CHANGELOG.md and LICENSE", () => {
		const out = createIgnoreConfig();
		expect(out).toContain("CHANGELOG.md");
		expect(out).toContain("LICENSE");
	});
});
