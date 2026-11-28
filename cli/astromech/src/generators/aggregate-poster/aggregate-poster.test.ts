import { describe, expect, it } from "vitest";

import { aggregatePoster } from "./aggregate-poster.js";

describe("aggregatePoster", () => {
	it("is sentinel only when ci.aggregate says exactly that", () => {
		expect(aggregatePoster({ ci: { aggregate: "sentinel" } })).toBe("sentinel");
	});

	it("is none only when ci.aggregate says exactly that", () => {
		expect(aggregatePoster({ ci: { aggregate: "none" } })).toBe("none");
		expect(aggregatePoster({ ci: { aggregate: "None" as never } })).toBe("actions");
	});

	it("is actions when it is not set, says actions, or is misspelled, so a typo keeps today's poster", () => {
		expect(aggregatePoster({})).toBe("actions");
		expect(aggregatePoster({ ci: {} })).toBe("actions");
		expect(aggregatePoster({ ci: { aggregate: "actions" } })).toBe("actions");
		expect(aggregatePoster({ ci: { aggregate: "Sentinel" as never } })).toBe("actions");
	});
});
