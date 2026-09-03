import { describe, expect, it } from "vitest";

import { defineConfig } from "../config/define-config.js";

describe("defineConfig", () => {
	it("returns the config object unchanged", () => {
		const config = {
			name: "my-app",
			providers: { source: "github" as const },
		};
		expect(defineConfig(config)).toBe(config);
	});

	it("preserves nested options", () => {
		const config = {
			name: "my-app",
			repo: { name: "org/my-app" },
			providers: {
				vault: ["1password", { vault: "my-app" }] as [string, Record<string, unknown>],
				source: "github" as const,
			},
		};
		expect(defineConfig(config)).toStrictEqual(config);
	});
});
