import { describe, expect, test } from "vitest";
import * as str from "./index.ts";

describe("toPlural", () => {
	test("returns singular form when count is 1", () => {
		expect(str.toPlural(1, "cat")).toBe("cat");
		expect(str.toPlural(1, "box")).toBe("box");
		expect(str.toPlural(1, "baby")).toBe("baby");
		expect(str.toPlural(1, "fish", "fish")).toBe("fish");
	});

	test("adds 'es' for words ending in 's', 'x', 'z', 'sh', or 'ch'", () => {
		expect(str.toPlural(2, "bus")).toBe("buses");
		expect(str.toPlural(3, "box")).toBe("boxes");
		expect(str.toPlural(4, "buzz")).toBe("buzzes");
		expect(str.toPlural(5, "dish")).toBe("dishes");
		expect(str.toPlural(6, "watch")).toBe("watches");
	});

	test("changes 'y' to 'ies' for words ending in consonant + y", () => {
		expect(str.toPlural(7, "baby")).toBe("babies");
		expect(str.toPlural(8, "puppy")).toBe("puppies");
	});

	test("adds 's' for regular pluralization", () => {
		expect(str.toPlural(9, "dog")).toBe("dogs");
		expect(str.toPlural(10, "car")).toBe("cars");
	});

	test("uses the provided plural form if available", () => {
		expect(str.toPlural(1, "fish", "fish")).toBe("fish");
		expect(str.toPlural(2, "fish", "fish")).toBe("fish");
		expect(str.toPlural(1, "person", "people")).toBe("person");
		expect(str.toPlural(3, "person", "people")).toBe("people");
	});

	test("handles edge cases for vowels and y", () => {
		expect(str.toPlural(2, "key")).toBe("keys"); // ends in vowel + y
		expect(str.toPlural(2, "boy")).toBe("boys"); // ends in vowel + y
	});

	test("handles empty or invalid inputs gracefully", () => {
		expect(str.toPlural(0, "cat")).toBe("cats");
		expect(str.toPlural(2, "")).toBe("s"); // Singular is empty
	});
});
