import { afterEach, describe, expect, it, vi } from "vitest";

import { codecovToken } from "./codecov-token.js";

afterEach(() => vi.unstubAllEnvs());

describe("codecovToken", () => {
	it("returns the token from the given environment", () => {
		expect(codecovToken({ CODECOV_TOKEN: "abc" })).toBe("abc");
	});

	it("prefers HOLOCRON_CODECOV_TOKEN over the bare name", () => {
		expect(codecovToken({ HOLOCRON_CODECOV_TOKEN: "prefixed", CODECOV_TOKEN: "bare" })).toBe("prefixed");
		expect(codecovToken({ HOLOCRON_CODECOV_TOKEN: "", CODECOV_TOKEN: "bare" })).toBe("bare");
	});

	it("is undefined when the token is unset or empty", () => {
		expect(codecovToken({})).toBeUndefined();
		expect(codecovToken({ CODECOV_TOKEN: "" })).toBeUndefined();
	});

	it("reads the process environment by default", () => {
		vi.stubEnv("CODECOV_TOKEN", "from-process");
		expect(codecovToken()).toBe("from-process");
	});
});
