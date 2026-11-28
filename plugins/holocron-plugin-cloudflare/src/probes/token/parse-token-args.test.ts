import { describe, expect, it } from "vitest";

import { parseTokenArgs } from "./parse-token-args.js";

describe("parseTokenArgs", () => {
	it("reads no arguments as no layer and no zones", () => {
		expect(parseTokenArgs([])).toEqual({ zones: [] });
	});

	it("reads zone names, and a layer in either spelling", () => {
		expect(parseTokenArgs(["a.dev", "b.dev"])).toEqual({ zones: ["a.dev", "b.dev"] });
		expect(parseTokenArgs(["--layer", "ci", "a.dev"])).toEqual({ layer: "ci", zones: ["a.dev"] });
		expect(parseTokenArgs(["--layer=dev"])).toEqual({ layer: "dev", zones: [] });
	});

	it("ignores other flags, and a --layer with no value", () => {
		expect(parseTokenArgs(["--copy", "a.dev", "--layer"])).toEqual({ zones: ["a.dev"] });
	});

	it("reads the token name in either spelling, and does not take its value for a zone", () => {
		expect(parseTokenArgs(["--layer", "ci", "--token-name", "HOLOCRON_CLOUDFLARE_TOKEN", "a.dev"])).toEqual({
			layer: "ci",
			tokenName: "HOLOCRON_CLOUDFLARE_TOKEN",
			zones: ["a.dev"],
		});
		expect(parseTokenArgs(["--token-name=X"])).toEqual({ tokenName: "X", zones: [] });
		expect(parseTokenArgs(["--token-name"])).toEqual({ zones: [] });
	});
});
