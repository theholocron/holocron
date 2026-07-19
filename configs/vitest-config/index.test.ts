import { vi, describe, it, expect } from "vitest";

// storybook() does a dynamic import of this plugin which resolves the .storybook
// directory at call time — mock it so the preset is testable in isolation.
vi.mock("@storybook/addon-vitest/vitest-plugin", () => ({
	storybookTest: vi.fn(() => ({ name: "storybook-vitest-plugin" })),
}));

import { node, react, storybook } from "./index.js";
import { library } from "./bundles/library.js";

describe("vitest-config — presets", () => {
	it("node() returns config with node environment", () => {
		const config = node();
		expect(config.test?.environment).toBe("node");
		expect(Array.isArray(config.test?.include)).toBe(true);
	});

	it("react() returns config with jsdom environment", () => {
		const config = react();
		expect(config.test?.environment).toBe("jsdom");
	});

	it("storybook() returns a config object", async () => {
		const config = await storybook();
		expect(typeof config).toBe("object");
		expect(config.test).toBeDefined();
	});

	it("presets accept option overrides", () => {
		const config = node({ reporters: ["verbose"] });
		expect(config.test?.reporters).toContain("verbose");
	});
});

describe("vitest-config — bundles", () => {
	it("library() returns config with coverage thresholds", () => {
		const config = library();
		expect(config.test?.coverage?.thresholds?.lines).toBe(80);
		expect(config.test?.coverage?.thresholds?.branches).toBe(80);
		expect(config.test?.coverage?.thresholds?.functions).toBe(80);
		expect(config.test?.coverage?.thresholds?.statements).toBe(80);
	});

	it("library() accepts per-file threshold overrides", () => {
		const config = library({
			thresholds: {
				"src/generated.ts": {
					lines: 0,
					functions: 0,
					branches: 0,
					statements: 0,
				},
			},
		});
		expect(
			config.test?.coverage?.thresholds?.["src/generated.ts"],
		).toBeDefined();
	});
});
