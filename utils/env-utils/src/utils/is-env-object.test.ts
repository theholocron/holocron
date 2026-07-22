import { describe, expect, it } from "vitest";
import { isEnvObject } from "./is-env-object.js";

describe("isEnvObject", () => {
	// --- returns true ---

	it("returns true for an empty object", () => {
		expect(isEnvObject({})).toBe(true);
	});

	it("returns true for a flat EnvObject", () => {
		expect(
			isEnvObject({ port: 3000, database_url: "postgres://localhost" }),
		).toBe(true);
	});

	it("returns true for a nested EnvObject", () => {
		expect(isEnvObject({ db: { host: "localhost", port: 5432 } })).toBe(
			true,
		);
	});

	// --- returns false for each Primitive member ---

	it("returns false for a string", () => {
		expect(isEnvObject("postgres://localhost")).toBe(false);
	});

	it("returns false for an empty string", () => {
		expect(isEnvObject("")).toBe(false);
	});

	it("returns false for a number", () => {
		expect(isEnvObject(3000)).toBe(false);
	});

	it("returns false for zero", () => {
		expect(isEnvObject(0)).toBe(false);
	});

	it("returns false for a boolean true", () => {
		expect(isEnvObject(true)).toBe(false);
	});

	it("returns false for a boolean false", () => {
		expect(isEnvObject(false)).toBe(false);
	});
});
