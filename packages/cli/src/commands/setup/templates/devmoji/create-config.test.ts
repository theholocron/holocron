import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("devmoji createConfig", () => {
	it("is a CJS module using defineConfig from devmoji-config", () => {
		const out = createConfig();
		expect(out).toContain("require(\"@theholocron/devmoji-config\")");
		expect(out).toContain("module.exports = defineConfig()");
	});

	it("includes eslint-disable to suppress module.exports warnings", () => {
		expect(createConfig()).toContain("eslint-disable");
	});
});
