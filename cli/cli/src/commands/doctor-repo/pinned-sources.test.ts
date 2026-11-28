import { describe, expect, it } from "vitest";

import { comparePinnedSources } from "./pinned-sources.js";

describe("comparePinnedSources", () => {
	it("is empty when the pins match, or neither side has one", () => {
		expect(comparePinnedSources({ a: 1 }, { a: 1 })).toEqual([]);
		expect(comparePinnedSources({}, {})).toEqual([]);
	});

	it("names a declared pin the ruleset lacks, one set to another app and one nothing declares", () => {
		expect(comparePinnedSources({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual([
			"a is not pinned (declared app 1; any app may satisfy it)",
			"b is pinned to app 3, declared app 2",
			"c is pinned to app 4 but ci.pin does not declare it",
		]);
	});
});
