import { describe, expect, it } from "vitest";

import { parseTokenArgs } from "./parse-token-args.js";

describe("parseTokenArgs", () => {
	it("reads --layer <word> and --layer=<word>, and ignores everything else", () => {
		expect(parseTokenArgs(["--layer", "ci"])).toEqual({ layer: "ci" });
		expect(parseTokenArgs(["--layer=dev"])).toEqual({ layer: "dev" });
		expect(parseTokenArgs(["other", "--layer", "prod", "--x"])).toEqual({ layer: "prod" });
	});

	it("reads --token-name <VAR> and --token-name=<VAR>", () => {
		expect(parseTokenArgs(["--layer", "ci", "--token-name", "HOLOCRON_X"])).toEqual({
			layer: "ci",
			tokenName: "HOLOCRON_X",
		});
		expect(parseTokenArgs(["--token-name=HOLOCRON_Y"])).toEqual({ tokenName: "HOLOCRON_Y" });
	});

	it("has no layer when none is given or it has no value", () => {
		expect(parseTokenArgs([])).toEqual({});
		expect(parseTokenArgs(["--layer"])).toEqual({});
	});
});
