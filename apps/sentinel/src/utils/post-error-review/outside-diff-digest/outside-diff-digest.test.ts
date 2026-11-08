import { describe, expect, it } from "vitest";

import { outsideDiffDigest } from "./outside-diff-digest.js";

const a = { file: "a.md", line: 1, body: "rule one" };
const b = { file: "b.md", line: 2, body: "rule two" };

describe("outsideDiffDigest", () => {
	it("is the same for the same findings in any order", () => {
		expect(outsideDiffDigest([a, b])).toBe(outsideDiffDigest([b, a]));
	});

	it("changes when a finding is added, removed or moved to another line", () => {
		const digest = outsideDiffDigest([a, b]);
		expect(outsideDiffDigest([a])).not.toBe(digest);
		expect(outsideDiffDigest([a, { ...b, line: 3 }])).not.toBe(digest);
		expect(outsideDiffDigest([a, { ...b, body: "rule three" }])).not.toBe(digest);
	});

	it("is a short hex string, also for no findings", () => {
		expect(outsideDiffDigest([a])).toMatch(/^[0-9a-f]{12}$/);
		expect(outsideDiffDigest([])).toMatch(/^[0-9a-f]{12}$/);
	});
});
