import { describe, expect, it } from "vitest";

import { parseSkipDocs } from "./parse-skip-docs.js";

describe("parseSkipDocs", () => {
	it("finds the marker and the reason on its line", () => {
		expect(parseSkipDocs("Fixes a thing.\n[skip docs] internal option, no page\nMore.")).toEqual({
			scope: null,
			reason: "internal option, no page",
		});
	});

	it("is case-insensitive and reads a scope of several packages", () => {
		expect(parseSkipDocs("[Skip Docs: array-utils, fs-utils] helpers only")).toEqual({
			scope: ["array-utils", "fs-utils"],
			reason: "helpers only",
		});
	});

	it("reports a marker without a reason, and none when there is no marker", () => {
		expect(parseSkipDocs("[skip docs]\nnext line")).toEqual({ scope: null, reason: "" });
		expect(parseSkipDocs("[skip ci] only")).toBeNull();
		expect(parseSkipDocs("")).toBeNull();
	});
});
