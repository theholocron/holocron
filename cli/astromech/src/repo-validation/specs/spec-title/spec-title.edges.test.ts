import { describe, expect, it } from "vitest";

import { specTitle } from "./spec-title.js";

describe("specTitle, the first heading read line by line", () => {
	it("drops closing hashes and the spaces around them, and reads a tab after the #", () => {
		expect(specTitle("a.spec.md", "# Title ##  \n")).toBe("Title");
		expect(specTitle("a.spec.md", "#\tTabbed title\t#\n")).toBe("Tabbed title");
	});

	it("reads a heading that ends in a carriage return", () => {
		expect(specTitle("a.spec.md", "# Windows title\r\nBody\r\n")).toBe("Windows title");
	});

	it("is its own text for a heading made only of hashes, and skips one with no text", () => {
		expect(specTitle("a.spec.md", "# ###\n")).toBe("#");
		expect(specTitle("tech-name.spec.md", "#   \n# Next\n")).toBe("Next");
	});

	it("skips a line that only looks like a heading, and falls back to the file name with none", () => {
		expect(specTitle("a.spec.md", "#NoSpace\n## Two\n# Real\n")).toBe("Real");
		expect(specTitle("my-spec.spec.md", "no heading here\n")).toBe("my-spec");
	});

	it("reads a long run of spaces or hashes in one pass", () => {
		const started = Date.now();
		specTitle("a.spec.md", `# ${" ".repeat(200_000)}x${"#".repeat(200_000)}\n`);
		expect(Date.now() - started).toBeLessThan(1000);
	});
});
