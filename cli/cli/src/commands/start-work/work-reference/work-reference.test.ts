import { describe, expect, it } from "vitest";

import { workReference } from "./work-reference.js";

describe("workReference", () => {
	it("puts a # on a bare number, which GitHub does not link without it", () => {
		expect(workReference("2500")).toBe("#2500");
		expect(workReference(" 2500 ")).toBe("#2500");
	});

	it("keeps #12, owner/repo#12 and a tracker's own key", () => {
		expect(workReference("#12")).toBe("#12");
		expect(workReference("acme/demo#12")).toBe("acme/demo#12");
		expect(workReference("ENG-42")).toBe("ENG-42");
	});
});
