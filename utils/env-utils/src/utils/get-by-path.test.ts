import { describe, expect, it } from "vitest";
import { getByPath } from "./index.js";

const env = {
	service: {
		db: { url: "postgres://localhost" },
	},
	port: 3000,
	flat_key: "flat",
};

describe("getByPath", () => {
	it("returns a primitive at a leaf path", () => {
		expect(getByPath(env, ["service", "db", "url"])).toBe(
			"postgres://localhost",
		);
	});

	it("returns a nested object at an intermediate path", () => {
		expect(getByPath(env, ["service", "db"])).toEqual({
			url: "postgres://localhost",
		});
	});

	it("returns undefined when a path segment doesn't exist", () => {
		expect(getByPath(env, ["service", "missing"])).toBeUndefined();
	});

	it("returns undefined when traversing through a primitive", () => {
		expect(getByPath(env, ["port", "sub"])).toBeUndefined();
	});

	it("returns undefined for a completely missing top-level key", () => {
		expect(getByPath(env, ["does_not_exist"])).toBeUndefined();
	});
});
