import { describe, expect, it } from "vitest";

import { parseTokenArgs } from "./parse-token-args.js";

describe("parseTokenArgs", () => {
	it("reads no arguments as no layer and no token name", () => {
		expect(parseTokenArgs([])).toEqual({});
	});

	it("reads the layer and the token name, each in either spelling", () => {
		expect(parseTokenArgs(["--layer", "ci", "--token-name", "HOLOCRON_ADMIN_TOKEN"])).toEqual({
			layer: "ci",
			tokenName: "HOLOCRON_ADMIN_TOKEN",
		});
		expect(parseTokenArgs(["--token-name=HOLOCRON_ORG_TOKEN", "--layer=dev"])).toEqual({
			layer: "dev",
			tokenName: "HOLOCRON_ORG_TOKEN",
		});
	});

	it("ignores other words and flags, and a flag with no value", () => {
		expect(parseTokenArgs(["--copy", "extra", "--layer"])).toEqual({});
	});
});
