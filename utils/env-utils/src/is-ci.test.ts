import { describe, expect, it } from "vitest";

import { isCI } from "./is-ci.js";

describe("isCI", () => {
	it("is true for CI=true and any other non-empty value", () => {
		expect(isCI({ CI: "true" })).toBe(true);
		expect(isCI({ CI: "1" })).toBe(true);
		expect(isCI({ CI: "yes" })).toBe(true);
	});

	it("is false when CI is unset, empty, false or 0", () => {
		expect(isCI({})).toBe(false);
		expect(isCI({ CI: "" })).toBe(false);
		expect(isCI({ CI: "false" })).toBe(false);
		expect(isCI({ CI: "0" })).toBe(false);
	});

	it("reads process.env when no environment is given", () => {
		const saved = process.env["CI"];
		process.env["CI"] = "true";
		try {
			expect(isCI()).toBe(true);
		} finally {
			if (saved === undefined) delete process.env["CI"];
			else process.env["CI"] = saved;
		}
	});
});
