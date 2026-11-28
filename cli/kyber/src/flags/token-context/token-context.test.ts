import { afterEach, describe, expect, it, vi } from "vitest";

import { tokenContext } from "./token-context.js";

const report = vi.fn();

afterEach(() => {
	process.exitCode = undefined;
	vi.clearAllMocks();
});

describe("tokenContext", () => {
	it("is an empty context when no --token was given", () => {
		expect(tokenContext(undefined, report)).toEqual({});
		expect(tokenContext([], report)).toEqual({});
		expect(report).not.toHaveBeenCalled();
	});

	it("parses a bare token and keyed tokens", () => {
		expect(tokenContext(["abc"], report)).toMatchObject({ cliToken: "abc" });
		expect(tokenContext(["github=ghp_1", "vercel=v_2"], report)).toMatchObject({
			cliTokens: { github: "ghp_1", vercel: "v_2" },
		});
	});

	it("reports a malformed --token, sets the exit code to 1, and returns null", () => {
		expect(tokenContext(["=oops"], report)).toBeNull();
		expect(report).toHaveBeenCalledWith(expect.stringMatching(/^--token: /));
		expect(process.exitCode).toBe(1);
	});

	it("rethrows anything that is not a token parse error", async () => {
		vi.resetModules();
		vi.doMock("../../secrets/token-args/index.js", () => ({
			parseTokenArgs: () => {
				throw new Error("disk on fire");
			},
			TokenParseError: class extends Error {},
		}));
		const { tokenContext: fresh } = await import("./token-context.js");
		expect(() => fresh(["x"], report)).toThrow("disk on fire");
		expect(report).not.toHaveBeenCalled();
		vi.doUnmock("../../secrets/token-args/index.js");
	});
});
