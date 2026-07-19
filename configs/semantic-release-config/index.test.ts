import { describe, it, expect } from "vitest";
import {
	commitAnalyzer,
	releaseNotesGenerator,
	defineConfig,
} from "./index.js";

describe("semantic-release-config", () => {
	describe("commitAnalyzer", () => {
		it("is a two-element tuple [plugin-name, options]", () => {
			expect(Array.isArray(commitAnalyzer)).toBe(true);
			expect(commitAnalyzer[0]).toBe("@semantic-release/commit-analyzer");
			expect(typeof commitAnalyzer[1]).toBe("object");
		});

		it("uses conventionalcommits preset", () => {
			const opts = commitAnalyzer[1] as { preset: string };
			expect(opts.preset).toBe("conventionalcommits");
		});
	});

	describe("releaseNotesGenerator", () => {
		it("is a two-element tuple [plugin-name, options]", () => {
			expect(Array.isArray(releaseNotesGenerator)).toBe(true);
			expect(releaseNotesGenerator[0]).toBe(
				"@semantic-release/release-notes-generator",
			);
		});
	});

	describe("defineConfig()", () => {
		it("returns an object with branches and plugins", () => {
			const config = defineConfig() as {
				branches: unknown[];
				plugins: unknown[];
			};
			expect(Array.isArray(config.branches)).toBe(true);
			expect(Array.isArray(config.plugins)).toBe(true);
		});

		it("defaults to main branch", () => {
			const config = defineConfig() as { branches: string[] };
			expect(config.branches).toContain("main");
		});

		it("accepts custom branches", () => {
			const config = defineConfig({ branches: ["main", "alpha"] }) as {
				branches: string[];
			};
			expect(config.branches).toContain("alpha");
		});
	});
});
