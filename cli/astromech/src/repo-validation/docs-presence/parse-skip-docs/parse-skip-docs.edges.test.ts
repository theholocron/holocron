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

	it("finds a marker after unclosed ones, reads the first closed one, and ignores other text after `[skip docs`", () => {
		expect(parseSkipDocs("[skip docs[skip docs:a] why")).toEqual({ scope: ["a"], reason: "why" });
		expect(parseSkipDocs("[skip docsx] [Skip Docs] later")).toEqual({ scope: null, reason: "later" });
		expect(parseSkipDocs("[skip docs: a [skip docs] why")).toEqual({ scope: ["a [skip docs"], reason: "why" });
		expect(parseSkipDocs("line one\n[skip docs] on two\nline three")).toEqual({ scope: null, reason: "on two" });
	});

	it("is null for a marker with nothing to close it, or a close before it", () => {
		expect(parseSkipDocs("[skip docs: a")).toBeNull();
		expect(parseSkipDocs("] then [skip docs")).toBeNull();
		expect(parseSkipDocs("[skip docs and more]")).toBeNull();
		expect(parseSkipDocs("no marker ] here")).toBeNull();
	});

	it("reads a long run of unclosed markers in one pass", () => {
		const started = Date.now();
		expect(parseSkipDocs("[skip docs".repeat(50_000))).toBeNull();
		expect(Date.now() - started).toBeLessThan(1000);
	});
});
