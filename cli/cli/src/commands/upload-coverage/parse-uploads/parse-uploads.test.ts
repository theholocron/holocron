import { describe, expect, it } from "vitest";

import { parseUploads } from "./parse-uploads.js";

describe("parseUploads", () => {
	it("reads the list the action takes, a glob string or a list of globs", () => {
		expect(
			parseUploads(
				JSON.stringify([
					{ flag: "utils", files: "utils/*/coverage/lcov.info" },
					{ flag: "x", files: ["a", "b"] },
				])
			)
		).toEqual({
			ok: true,
			uploads: [
				{ flag: "utils", files: ["utils/*/coverage/lcov.info"] },
				{ flag: "x", files: ["a", "b"] },
			],
		});
	});

	it("accepts an empty list", () => {
		expect(parseUploads("[]")).toEqual({ ok: true, uploads: [] });
	});

	it.each([
		["not JSON", "{nope"],
		["an object", '{"flag":"a","files":"b"}'],
		["a missing flag", '[{"files":"b"}]'],
		["an empty flag", '[{"flag":"","files":"b"}]'],
		["a missing files", '[{"flag":"a"}]'],
		["an empty files string", '[{"flag":"a","files":""}]'],
		["an empty files list", '[{"flag":"a","files":[]}]'],
		["a files list with a non-string", '[{"flag":"a","files":["b",1]}]'],
		["a non-object entry", "[1]"],
		["a null entry", "[null]"],
	])("refuses %s", (_name, text) => {
		const result = parseUploads(text);
		expect(result.ok).toBe(false);
		expect((result as { message: string }).message).toMatch(/JSON list of/);
	});
});
