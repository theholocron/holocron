import { describe, expect, it } from "vitest";

import { numeric } from "./numeric.js";

describe("numeric", () => {
	it("accepts digits", () => {
		expect(numeric("42")).toBe(true);
	});

	it.each(["", "4x", "-1", "1.5", " 1"])("rejects %j with a message", (value) => {
		expect(numeric(value)).toBe("enter a number");
	});
});
