import { describe, it, expect } from "vitest";
import config from "./index.js";

describe("bundlewatch-config", () => {
	it("exports a files array", () => {
		expect(Array.isArray(config.files)).toBe(true);
		expect(config.files.length).toBeGreaterThan(0);
	});

	it("each file entry has a path and maxSize", () => {
		for (const file of config.files) {
			expect(typeof file.path).toBe("string");
			expect(typeof file.maxSize).toBe("string");
		}
	});
});
