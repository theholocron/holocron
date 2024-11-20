import { describe, expect, test } from "vitest";
import * as str from "./index.ts";

describe("toPlural", () => {
	test("returns singular form when count is 1", () => {
		expect(str.toPlural(1, "cat")).toBe("1 cat");
		expect(str.toPlural(1, "box")).toBe("1 box");
		expect(str.toPlural(1, "baby")).toBe("1 baby");
		expect(str.toPlural(1, "fish", "fish")).toBe("1 fish");
	});

	test("adds 'es' for words ending in 's', 'x', 'z', 'sh', or 'ch'", () => {
		expect(str.toPlural(2, "bus")).toBe("2 buses");
		expect(str.toPlural(3, "box")).toBe("3 boxes");
		expect(str.toPlural(4, "buzz")).toBe("4 buzzes");
		expect(str.toPlural(5, "dish")).toBe("5 dishes");
		expect(str.toPlural(6, "watch")).toBe("6 watches");
	});

	test("changes 'y' to 'ies' for words ending in consonant + y", () => {
		expect(str.toPlural(7, "baby")).toBe("7 babies");
		expect(str.toPlural(8, "puppy")).toBe("8 puppies");
	});

	test("adds 's' for regular pluralization", () => {
		expect(str.toPlural(9, "dog")).toBe("9 dogs");
		expect(str.toPlural(10, "car")).toBe("10 cars");
	});

	test("uses the provided plural form if available", () => {
		expect(str.toPlural(1, "fish", "fish")).toBe("1 fish");
		expect(str.toPlural(2, "fish", "fish")).toBe("2 fish");
		expect(str.toPlural(1, "person", "people")).toBe("1 person");
		expect(str.toPlural(3, "person", "people")).toBe("3 people");
	});

	test("handles edge cases for vowels and y", () => {
		expect(str.toPlural(2, "key")).toBe("2 keys"); // ends in vowel + y
		expect(str.toPlural(2, "boy")).toBe("2 boys"); // ends in vowel + y
	});

	test("handles empty or invalid inputs gracefully", () => {
		expect(str.toPlural(0, "cat")).toBe("0 cats");
		expect(str.toPlural(2, "")).toBe("2 s"); // Singular is empty
	});
});
