import { describe, expect, it } from "vitest";

import { propertyFixHints } from "./property-fix-hints.js";

describe("propertyFixHints", () => {
	it("says to add a refused value to the organization's definition", () => {
		expect(propertyFixHints("Value 'credentials' is not allowed for property 'holocron_capabilities'")).toEqual([
			'add "credentials" to the allowed values of the organization custom property holocron_capabilities (the organization\'s Settings, Custom properties), then run repo setup again',
		]);
	});

	it("groups the values of one property, and gives one sentence per property", () => {
		const hints = propertyFixHints(
			"Validation Failed: Value 'a' is not allowed for property 'p', Value 'b' is not allowed for property 'p', Value 'a' is not allowed for property 'p', Value 'x' is not allowed for property 'q'"
		);
		expect(hints).toHaveLength(2);
		expect(hints[0]).toContain('add "a", "b" to the allowed values of the organization custom property p');
		expect(hints[1]).toContain('add "x" to the allowed values of the organization custom property q');
	});

	it("is empty when the message names no refused value", () => {
		expect(propertyFixHints("Validation Failed")).toEqual([]);
		expect(propertyFixHints("")).toEqual([]);
	});
});
