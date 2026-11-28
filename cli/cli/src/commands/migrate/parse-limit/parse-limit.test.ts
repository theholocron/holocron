import { describe, expect, it } from "vitest";

import { ConfigError } from "../../../config/index.js";
import { parseLimit } from "./parse-limit.js";

describe("parseLimit", () => {
	it("is undefined when the flag was not given", () => {
		expect(parseLimit(undefined, "migrate issues")).toBeUndefined();
	});

	it("reads a positive whole number", () => {
		expect(parseLimit("5", "migrate issues")).toBe(5);
		expect(parseLimit(" 120 ", "migrate issues")).toBe(120);
	});

	it.each(["0", "-3", "2.5", "abc", "", "1e3", "99999999999999999999"])("rejects %j by name", (value) => {
		const err = (() => {
			try {
				parseLimit(value, "sync issues");
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as ConfigError).message).toMatch(/sync issues: --limit ".*" is not a positive whole number/);
	});
});
