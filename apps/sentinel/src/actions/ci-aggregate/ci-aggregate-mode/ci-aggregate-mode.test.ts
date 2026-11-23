import { describe, expect, it } from "vitest";

import { ciAggregateMode } from "./ci-aggregate-mode.js";

describe("ciAggregateMode", () => {
	it("is shadow only when SENTINEL_CI_AGGREGATE says shadow", () => {
		expect(ciAggregateMode({ SENTINEL_CI_AGGREGATE: "shadow" })).toBe("shadow");
	});

	it("is off when unset, empty or anything else, so a typo fails quiet", () => {
		expect(ciAggregateMode({})).toBe("off");
		expect(ciAggregateMode({ SENTINEL_CI_AGGREGATE: "" })).toBe("off");
		expect(ciAggregateMode({ SENTINEL_CI_AGGREGATE: "Shadow" })).toBe("off");
		expect(ciAggregateMode({ SENTINEL_CI_AGGREGATE: "on" })).toBe("off");
	});
});
