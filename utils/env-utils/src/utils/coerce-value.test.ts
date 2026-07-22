import { describe, expect, it } from "vitest";
import { coerceValue } from "./index.js";

describe("coerceValue", () => {
	it('coerces "true" to boolean true', () => {
		expect(coerceValue("true")).toBe(true);
	});

	it('coerces "false" to boolean false', () => {
		expect(coerceValue("false")).toBe(false);
	});

	it("coerces numeric strings to numbers", () => {
		expect(coerceValue("42")).toBe(42);
		expect(coerceValue("3.14")).toBe(3.14);
		expect(coerceValue("-7")).toBe(-7);
	});

	it("leaves regular strings as-is", () => {
		expect(coerceValue("hello")).toBe("hello");
		expect(coerceValue("https://example.com")).toBe("https://example.com");
	});
});
