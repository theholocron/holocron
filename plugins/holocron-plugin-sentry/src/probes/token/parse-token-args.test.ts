import { describe, expect, it } from "vitest";

import { parseTokenArgs } from "./parse-token-args.js";

describe("parseTokenArgs", () => {
	it("reads no arguments as no layer and no token name", () => {
		expect(parseTokenArgs([])).toEqual({});
	});

	it("reads a layer and a token name, in either spelling", () => {
		expect(parseTokenArgs(["--layer", "ci", "--token-name", "HOLOCRON_SENTRY_RELEASE_TOKEN"])).toEqual({
			layer: "ci",
			tokenName: "HOLOCRON_SENTRY_RELEASE_TOKEN",
		});
		expect(parseTokenArgs(["--layer=dev", "--token-name=HOLOCRON_SENTRY_COMLINK_TOKEN"])).toEqual({
			layer: "dev",
			tokenName: "HOLOCRON_SENTRY_COMLINK_TOKEN",
		});
	});

	it("ignores other words and flags, and a flag with no value", () => {
		expect(parseTokenArgs(["--copy", "other", "comlink", "--layer"])).toEqual({});
	});
});
