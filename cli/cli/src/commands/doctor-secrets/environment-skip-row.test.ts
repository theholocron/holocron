import { describe, expect, it } from "vitest";

import { environmentSkipRow } from "./environment-skip-row.js";

describe("environmentSkipRow", () => {
	it("says test has no layer", () => {
		expect(environmentSkipRow("test")).toMatchObject({
			status: "skip",
			detail: "test: has no layer (tests use fakes and read none)",
		});
	});

	it("has no row for the environments that are compared", () => {
		expect(environmentSkipRow("local")).toBeUndefined();
		expect(environmentSkipRow("dev")).toBeUndefined();
		expect(environmentSkipRow("ci")).toBeUndefined();
		expect(environmentSkipRow("prod")).toBeUndefined();
	});
});
