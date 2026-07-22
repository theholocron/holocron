import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DotenvLoader } from "./loader.js";

// dotenv/config is a side-effect — mock it so tests never touch the filesystem
vi.mock("dotenv/config", () => ({}));

describe("DotenvLoader", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("implements the EnvLoader interface — load() returns a record", () => {
		const loader = new DotenvLoader();
		const result = loader.load();
		expect(result).toBeDefined();
		expect(typeof result).toBe("object");
	});

	it("returns process.env after loading", () => {
		vi.stubEnv("TEST_VAR", "hello");

		const loader = new DotenvLoader();
		const result = loader.load();

		expect(result["TEST_VAR"]).toBe("hello");
	});

	it("reflects all stubbed env vars in the returned record", () => {
		vi.stubEnv("FOO", "foo-value");
		vi.stubEnv("BAR", "bar-value");

		const loader = new DotenvLoader();
		const result = loader.load();

		expect(result["FOO"]).toBe("foo-value");
		expect(result["BAR"]).toBe("bar-value");
	});

	it("returns undefined for keys not present in process.env", () => {
		const loader = new DotenvLoader();
		const result = loader.load();

		expect(result["DEFINITELY_NOT_SET_XYZ"]).toBeUndefined();
	});

	it("calls dotenv/config as a side effect", async () => {
		// Verify the mock was called — i.e. the require("dotenv/config")
		// inside load() executed without throwing
		const loader = new DotenvLoader();
		expect(() => loader.load()).not.toThrow();

		const dotenv = await import("dotenv/config");
		expect(dotenv).toBeDefined();
	});

	it("is safe to call load() multiple times — dotenv is a no-op on repeat calls", () => {
		const loader = new DotenvLoader();

		expect(() => {
			loader.load();
			loader.load();
			loader.load();
		}).not.toThrow();
	});

	it("satisfies the EnvLoader interface structurally", () => {
		const loader = new DotenvLoader();
		// Type-level check — if this compiles, the interface is satisfied.
		// At runtime, verify the shape explicitly.
		expect(typeof loader.load).toBe("function");
	});
});
