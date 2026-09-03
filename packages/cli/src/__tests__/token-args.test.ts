import { describe, expect, it } from "vitest";

import { parseTokenArgs, TokenParseError } from "../auth/token-args.js";

describe("parseTokenArgs", () => {
	it("returns empty object for empty array", () => {
		expect(parseTokenArgs([])).toEqual({});
	});

	it("bare value → { cliToken }", () => {
		expect(parseTokenArgs(["ghp_xxx"])).toEqual({ cliToken: "ghp_xxx" });
	});

	it("keyed value → { cliTokens }", () => {
		expect(parseTokenArgs(["github=ghp_xxx"])).toEqual({
			cliTokens: { github: "ghp_xxx" },
		});
	});

	it("two keyed values → { cliTokens } with both entries", () => {
		expect(parseTokenArgs(["github=ghp_xxx", "vercel=v_yyy"])).toEqual({
			cliTokens: { github: "ghp_xxx", vercel: "v_yyy" },
		});
	});

	it("keyed + bare → both fields populated", () => {
		expect(parseTokenArgs(["github=ghp_xxx", "fallback_tok"])).toEqual({
			cliToken: "fallback_tok",
			cliTokens: { github: "ghp_xxx" },
		});
	});

	it("splits on first = only — value may contain =", () => {
		expect(parseTokenArgs(["neon=base64==padding=="])).toEqual({
			cliTokens: { neon: "base64==padding==" },
		});
	});

	it("throws for two bare values", () => {
		expect(() => parseTokenArgs(["abc", "def"])).toThrow(TokenParseError);
		expect(() => parseTokenArgs(["abc", "def"])).toThrow(/only one bare/);
	});

	it("throws for empty vendor (=value)", () => {
		expect(() => parseTokenArgs(["=ghp_xxx"])).toThrow(TokenParseError);
		expect(() => parseTokenArgs(["=ghp_xxx"])).toThrow(/vendor name must not be empty/);
	});

	it("throws for whitespace-only vendor", () => {
		expect(() => parseTokenArgs([" =ghp_xxx"])).toThrow(TokenParseError);
		expect(() => parseTokenArgs([" =ghp_xxx"])).toThrow(/vendor name must not be empty/);
	});

	it("throws for vendor with internal whitespace", () => {
		expect(() => parseTokenArgs(["git hub=ghp_xxx"])).toThrow(TokenParseError);
		expect(() => parseTokenArgs(["git hub=ghp_xxx"])).toThrow(/whitespace/);
	});

	it("throws for empty value (vendor=)", () => {
		expect(() => parseTokenArgs(["github="])).toThrow(TokenParseError);
		expect(() => parseTokenArgs(["github="])).toThrow(/token value must not be empty/);
	});

	it("TokenParseError has the correct name", () => {
		expect(new TokenParseError("x").name).toBe("TokenParseError");
	});
});
