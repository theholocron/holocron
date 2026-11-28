import { describe, expect, it } from "vitest";

import { ProviderApiError } from "../../plugin/index.js";
import { incidentWriteFailure } from "./incident-write-failure.js";

describe("incidentWriteFailure", () => {
	it("names what failed and why", () => {
		const err = new ProviderApiError("Checkly", 403, "forbidden");
		const text = incidentWriteFailure('opening "X"', err);
		expect(text).toMatch(/^opening "X": /);
		expect(text).not.toMatch(/may or may not/);
	});

	it("says a transport failure may have been written", () => {
		const err = new ProviderApiError("Checkly", 0, "timed out");
		expect(incidentWriteFailure('opening "X"', err)).toMatch(/may or may not have been written/);
	});

	it("handles a plain error", () => {
		expect(incidentWriteFailure("writing", new Error("boom"))).toBe("writing: boom");
	});
});
