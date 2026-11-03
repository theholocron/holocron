import { parse } from "dotenv";
import { describe, expect, it } from "vitest";

import { dotenvLine } from "./dotenv-line.js";

/** What dotenv, the parser an import reads with, gives back for the line. */
const roundTrip = (value: string): string | undefined => {
	const line = dotenvLine("T", value);
	return line === null ? undefined : parse(line).T;
};

describe("dotenvLine", () => {
	it("writes a plain value bare", () => {
		expect(dotenvLine("T", "ghp_abc.DEF-1/2=")).toBe("T=ghp_abc.DEF-1/2=");
		expect(dotenvLine("T", "")).toBe("T=");
	});

	it("wraps a value with a space, # or quote in single quotes when it has none, and dotenv reads it back as written", () => {
		expect(dotenvLine("T", "a b")).toBe("T='a b'");
		expect(roundTrip("a b#c")).toBe("a b#c");
		expect(roundTrip('say "hi"')).toBe('say "hi"');
		expect(roundTrip("back\\slash and 'no'".replace(/'/g, ""))).toBe("back\\slash and no");
	});

	it("falls to double quotes, then backticks, when the earlier ones are in the value", () => {
		expect(dotenvLine("T", "it's")).toBe('T="it\'s"');
		expect(roundTrip("it's")).toBe("it's");
		expect(dotenvLine("T", 'it\'s "x"')).toBe('T=`it\'s "x"`');
		expect(roundTrip('it\'s "x"')).toBe('it\'s "x"');
	});

	it("writes a line break as \\n inside double quotes, and dotenv reads it back", () => {
		expect(dotenvLine("T", "a\nb")).toBe('T="a\\nb"');
		expect(roundTrip("-----BEGIN-----\nabc\r\n-----END-----")).toBe("-----BEGIN-----\nabc\r\n-----END-----");
	});

	it("is null for a value no dotenv form can carry", () => {
		expect(dotenvLine("T", "a'b\"c`d e")).toBeNull();
		expect(dotenvLine("T", 'multi\nline with "quote"')).toBeNull();
		expect(dotenvLine("T", "multi\nline with \\ backslash")).toBeNull();
	});
});
