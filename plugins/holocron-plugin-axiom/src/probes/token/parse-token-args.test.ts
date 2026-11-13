import { describe, expect, it } from "vitest";

import { parseTokenArgs } from "./parse-token-args.js";

describe("parseTokenArgs", () => {
	it("reads no arguments as no layer and no datasets", () => {
		expect(parseTokenArgs([])).toEqual({ datasets: [] });
	});

	it("reads dataset names, and a layer in either spelling", () => {
		expect(parseTokenArgs(["a", "b"])).toEqual({ datasets: ["a", "b"] });
		expect(parseTokenArgs(["--layer", "ci", "a"])).toEqual({ layer: "ci", datasets: ["a"] });
		expect(parseTokenArgs(["--layer=dev"])).toEqual({ layer: "dev", datasets: [] });
	});

	it("ignores other flags, and a --layer with no value", () => {
		expect(parseTokenArgs(["--copy", "a", "--layer"])).toEqual({ datasets: ["a"] });
	});
});
