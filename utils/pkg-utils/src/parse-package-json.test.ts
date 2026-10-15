import { describe, expect, it } from "vitest";

import { parsePackageJson } from "./parse-package-json.ts";

describe("parsePackageJson", () => {
	it("parses a JSON object", () => {
		expect(parsePackageJson('{"name":"x","scripts":{"a":"b"}}')).toEqual({ name: "x", scripts: { a: "b" } });
	});

	it("ignores a leading byte-order mark", () => {
		expect(parsePackageJson('﻿{"name":"x"}')).toEqual({ name: "x" });
	});

	it("returns undefined for invalid JSON", () => {
		expect(parsePackageJson("{ nope")).toBeUndefined();
		expect(parsePackageJson("")).toBeUndefined();
	});

	it("returns undefined for valid JSON that isn't an object", () => {
		for (const text of ["[]", "null", '"x"', "1", "true"]) expect(parsePackageJson(text)).toBeUndefined();
	});

	it("leaves out recognized fields of the wrong type", () => {
		const pkg = parsePackageJson(
			JSON.stringify({
				name: 7,
				version: null,
				packageManager: [],
				private: "yes",
				scripts: ["a"],
				dependencies: "x",
			})
		);
		expect(pkg).toEqual({});
	});

	it("keeps only the string-valued entries of a string-map field", () => {
		expect(parsePackageJson('{"dependencies":{"a":"1","b":2,"c":null},"scripts":{"t":"vitest"}}')).toEqual({
			dependencies: { a: "1" },
			scripts: { t: "vitest" },
		});
	});

	it("passes unrecognized fields through untouched", () => {
		expect(parsePackageJson('{"bin":{"x":"y"},"exports":"./a.js","private":true}')).toEqual({
			bin: { x: "y" },
			exports: "./a.js",
			private: true,
		});
	});
});
