import { describe, it, expect } from "vitest";
import { defaultAssertions, defineConfig } from "./index.js";

describe("lighthouse-config", () => {
	describe("defaultAssertions", () => {
		it("warns on largest-contentful-paint below 0.9", () => {
			expect(defaultAssertions["largest-contentful-paint"]).toEqual(["warn", { minScore: 0.9 }]);
		});

		it("warns on unused-javascript with maxLength 0", () => {
			expect(defaultAssertions["unused-javascript"]).toEqual(["warn", { maxLength: 0 }]);
		});
	});

	describe("defineConfig()", () => {
		it("wraps a single url in an array", () => {
			const config = defineConfig({ url: "http://localhost:3000/" });
			expect(config.ci.collect.url).toEqual(["http://localhost:3000/"]);
		});

		it("passes an array url through unchanged", () => {
			const urls = ["http://localhost:3000/", "http://localhost:3000/about"];
			const config = defineConfig({ url: urls });
			expect(config.ci.collect.url).toEqual(urls);
		});

		it("includes startServerCommand when provided", () => {
			const config = defineConfig({
				url: "http://localhost:3000/",
				startServerCommand: "pnpm dev",
			});
			expect(config.ci.collect.startServerCommand).toBe("pnpm dev");
		});

		it("omits startServerCommand when not provided", () => {
			const config = defineConfig({ url: "http://localhost:3000/" });
			expect(config.ci.collect).not.toHaveProperty("startServerCommand");
		});

		it("uses defaultAssertions by default", () => {
			const config = defineConfig({ url: "http://localhost:3000/" });
			expect(config.ci.assert.assertions).toBe(defaultAssertions);
		});

		it("accepts custom assertions", () => {
			const custom = { "bf-cache": ["error", { minScore: 1 }] as ["error", { minScore: number }] };
			const config = defineConfig({
				url: "http://localhost:3000/",
				assertions: custom,
			});
			expect(config.ci.assert.assertions["bf-cache"]).toEqual(["error", { minScore: 1 }]);
		});

		it("defaults upload target to temporary-public-storage", () => {
			const config = defineConfig({ url: "http://localhost:3000/" });
			expect(config.ci.upload.target).toBe("temporary-public-storage");
		});

		it("accepts a custom upload target", () => {
			const config = defineConfig({
				url: "http://localhost:3000/",
				uploadTarget: "lhci",
			});
			expect(config.ci.upload.target).toBe("lhci");
		});

		it("includes startServerReadyPattern when provided", () => {
			const config = defineConfig({
				url: "http://localhost:3000/",
				startServerReadyPattern: "Accepting",
			});
			expect(config.ci.collect.startServerReadyPattern).toBe("Accepting");
		});

		it("omits startServerReadyPattern when not provided", () => {
			const config = defineConfig({ url: "http://localhost:3000/" });
			expect(config.ci.collect).not.toHaveProperty("startServerReadyPattern");
		});

		it("includes startServerReadyPattern when empty string", () => {
			const config = defineConfig({
				url: "http://localhost:3000/",
				startServerReadyPattern: "",
			});
			expect(config.ci.collect.startServerReadyPattern).toBe("");
		});

		it("includes startServerReadyTimeout when provided", () => {
			const config = defineConfig({
				url: "http://localhost:3000/",
				startServerReadyTimeout: 120000,
			});
			expect(config.ci.collect.startServerReadyTimeout).toBe(120000);
		});

		it("omits startServerReadyTimeout when not provided", () => {
			const config = defineConfig({ url: "http://localhost:3000/" });
			expect(config.ci.collect).not.toHaveProperty("startServerReadyTimeout");
		});

		it("includes startServerReadyTimeout when 0", () => {
			const config = defineConfig({
				url: "http://localhost:3000/",
				startServerReadyTimeout: 0,
			});
			expect(config.ci.collect.startServerReadyTimeout).toBe(0);
		});
	});
});
