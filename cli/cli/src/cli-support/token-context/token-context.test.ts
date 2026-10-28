import { afterEach, describe, expect, it, vi } from "vitest";

const report = vi.hoisted(() => vi.fn());
vi.mock("../../observability/logger/index.js", () => ({ reportError: report }));

import { tokenContext } from "./token-context.js";

afterEach(() => {
	process.exitCode = undefined;
	vi.clearAllMocks();
});

describe("tokenContext", () => {
	it("is an empty context when no --token was given", () => {
		expect(tokenContext(undefined)).toEqual({});
		expect(tokenContext([])).toEqual({});
	});

	it("parses a bare token and keyed tokens", () => {
		expect(tokenContext(["abc"])).toMatchObject({ cliToken: "abc" });
		expect(tokenContext(["github=ghp_1", "vercel=v_2"])).toMatchObject({
			cliTokens: { github: "ghp_1", vercel: "v_2" },
		});
	});

	it("reports a malformed --token, exits 1, and returns null", () => {
		expect(tokenContext(["=oops"])).toBeNull();
		expect(report).toHaveBeenCalledWith(expect.stringContaining("--token:"));
		expect(process.exitCode).toBe(1);
	});

	it("rethrows anything that is not a token parse error", async () => {
		vi.resetModules();
		vi.doMock("../../auth/index.js", () => ({
			parseTokenArgs: () => {
				throw new Error("disk on fire");
			},
			TokenParseError: class extends Error {},
		}));
		const { tokenContext: fresh } = await import("./token-context.js");
		expect(() => fresh(["x"])).toThrow("disk on fire");
		vi.doUnmock("../../auth/index.js");
	});
});
