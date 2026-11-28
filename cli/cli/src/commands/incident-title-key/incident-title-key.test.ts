import { describe, expect, it } from "vitest";

import { incidentTitleKey } from "./incident-title-key.js";

describe("incidentTitleKey", () => {
	it("trims, lower-cases and collapses whitespace", () => {
		expect(incidentTitleKey("  Sentinel   DOWN\t now ")).toBe("sentinel down now");
	});

	it("gives two spellings of one title the same key and different titles different keys", () => {
		expect(incidentTitleKey("Docs down")).toBe(incidentTitleKey(" docs  DOWN "));
		expect(incidentTitleKey("Docs down")).not.toBe(incidentTitleKey("Docs up"));
	});
});
