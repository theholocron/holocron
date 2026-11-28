import { describe, expect, it } from "vitest";

import { parseSkipDocs } from "./parse-skip-docs.js";

describe("parseSkipDocs, the scope after the colon", () => {
	it("has no scope when the colon is followed by nothing but whitespace", () => {
		expect(parseSkipDocs("[skip docs:   ] reason")).toEqual({ scope: null, reason: "reason" });
		expect(parseSkipDocs("[skip docs:] reason")).toEqual({ scope: null, reason: "reason" });
	});

	it("trims every name of a scope, and drops an empty one", () => {
		expect(parseSkipDocs("[skip docs:  pkg-a ,, pkg-b  ] why")).toEqual({
			scope: ["pkg-a", "pkg-b"],
			reason: "why",
		});
	});

	it("reads a long run of whitespace after the colon in one pass", () => {
		const started = Date.now();
		parseSkipDocs(`[skip docs:${" ".repeat(200_000)}x`);
		expect(Date.now() - started).toBeLessThan(1000);
	});
});
