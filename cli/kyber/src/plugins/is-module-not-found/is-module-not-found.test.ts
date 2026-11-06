import { describe, expect, it } from "vitest";

import { isModuleNotFound } from "./is-module-not-found.js";

describe("isModuleNotFound", () => {
	it("matches ERR_MODULE_NOT_FOUND and MODULE_NOT_FOUND by code", () => {
		expect(isModuleNotFound(Object.assign(new Error("nope"), { code: "ERR_MODULE_NOT_FOUND" }))).toBe(true);
		expect(isModuleNotFound(Object.assign(new Error("nope"), { code: "MODULE_NOT_FOUND" }))).toBe(true);
	});

	it("matches the 'Cannot find package' message", () => {
		expect(isModuleNotFound(new Error("Cannot find package '@x/y' imported from z"))).toBe(true);
	});

	it("matches a bare MODULE_NOT_FOUND string", () => {
		expect(isModuleNotFound(new Error("MODULE_NOT_FOUND"))).toBe(true);
	});

	it("is false for an unrelated error and for non-errors", () => {
		expect(isModuleNotFound(new Error("no token found"))).toBe(false);
		expect(isModuleNotFound("Cannot find package")).toBe(false);
		expect(isModuleNotFound(undefined)).toBe(false);
	});
});
