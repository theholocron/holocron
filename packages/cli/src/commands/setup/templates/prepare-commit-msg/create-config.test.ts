import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("prepare-commit-msg createConfig", () => {
	it("is a shell script", () => {
		expect(createConfig()).toMatch(/^#!/);
	});

	it("validates git user.name and user.email", () => {
		const out = createConfig();
		expect(out).toContain("git config user.name");
		expect(out).toContain("git config user.email");
	});

	it("appends the DCO Signed-off-by trailer", () => {
		expect(createConfig()).toContain("Signed-off-by");
	});

	it("runs devmoji", () => {
		expect(createConfig()).toContain("devmoji");
	});
});
