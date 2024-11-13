import { describe, expect, test } from "vitest";
import * as str from "./index.ts";

describe("String casting", () => {
	test("wrap a string into an array", () => {
		expect(str.toArray("hello world")).toEqual(["hello world"]);
	});

	test("return the same array if input is already an array", () => {
		expect(str.toArray(["hello world"])).toEqual(["hello world"]);
	});

	test("'true' string casts to a true boolean", () => {
		expect(str.toBoolean("true")).toBe(true);
	});

	test("'' string casts to a false boolean", () => {
		expect(str.toBoolean("")).toBe(false);
	});
});
