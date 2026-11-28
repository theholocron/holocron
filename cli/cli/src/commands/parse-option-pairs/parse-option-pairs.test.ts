import { describe, expect, it } from "vitest";

import { ConfigError } from "../../config/index.js";
import { parseOptionPairs } from "./parse-option-pairs.js";

describe("parseOptionPairs", () => {
	it("reads comma separated pairs, trimmed, keeping an = inside a value", () => {
		expect(parseOptionPairs("team=ENG, repo = a/b ,q=x=y", "--with")).toEqual({
			team: "ENG",
			repo: "a/b",
			q: "x=y",
		});
	});

	it("skips blank pairs and returns nothing for empty text", () => {
		expect(parseOptionPairs("a=1,, ,b=2", "--with")).toEqual({ a: "1", b: "2" });
		expect(parseOptionPairs("", "--with")).toEqual({});
	});

	it("rejects a pair with no = or no key, naming the flag", () => {
		expect(() => parseOptionPairs("team", "--with")).toThrow(new ConfigError('--with: "team" is not key=value'));
		expect(() => parseOptionPairs("=ENG", "--from")).toThrow(/--from: "=ENG" is not key=value/);
	});
});
