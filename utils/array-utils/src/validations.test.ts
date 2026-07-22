import { describe, expect, test } from "vitest";
import * as arr from "./index.ts";

describe("Array", () => {
	test("return false for null", () => {
		expect(arr.isValid(null)).toBe(false);
	});

	test("return false for undefined", () => {
		expect(arr.isValid(undefined)).toBe(false);
	});

	test("return false for an empty array", () => {
		expect(arr.isValid([])).toBe(false);
	});

	test("return true for a non-empty array", () => {
		expect(arr.isValid([1, 2, 3])).toBe(true);
	});

	test("return true for a non-null, non-undefined non-array value", () => {
		expect(arr.isValid(42)).toBe(true);
		expect(arr.isValid("hello")).toBe(true);
		expect(arr.isValid({ key: "value" })).toBe(true);
	});

	test("return true for a boolean value", () => {
		expect(arr.isValid(true)).toBe(true);
		expect(arr.isValid(false)).toBe(true);
	});
});
