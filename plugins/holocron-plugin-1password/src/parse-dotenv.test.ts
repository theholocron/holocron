import { describe, expect, it } from "vitest";

import { parseDotenv } from "./parse-dotenv.js";

describe("parseDotenv", () => {
	it("reads KEY=VALUE lines and skips blanks, comments and lines with no =", () => {
		expect(parseDotenv("A=1\n\n# note\nNOPE\nB=two words\nC=")).toEqual({ A: "1", B: "two words", C: "" });
	});

	it("drops a leading export and surrounding spaces", () => {
		expect(parseDotenv("export A = 1\n  B=2  ")).toEqual({ A: "1", B: "2" });
	});

	it("keeps an = and a # inside a value", () => {
		expect(parseDotenv("A=x=y#z")).toEqual({ A: "x=y#z" });
	});

	it("unquotes and unescapes double-quoted values", () => {
		expect(parseDotenv('A="a\\nb\\t\\"q\\" \\\\ \\r"')).toEqual({ A: 'a\nb\t"q" \\ \r' });
	});

	it("takes single-quoted values as written", () => {
		expect(parseDotenv("A='a\\nb $X'")).toEqual({ A: "a\\nb $X" });
	});

	it("reads a double-quoted value that runs over several lines", () => {
		expect(parseDotenv('KEY="-----BEGIN-----\nabc\n-----END-----"\nB=2')).toEqual({
			KEY: "-----BEGIN-----\nabc\n-----END-----",
			B: "2",
		});
	});

	it("takes an unterminated quoted value to the end of the text", () => {
		expect(parseDotenv('A="open\nrest')).toEqual({ A: "open\nrest" });
	});

	it("does not end a quoted value at an escaped quote", () => {
		expect(parseDotenv('A="a\\"b" # trailing')).toEqual({ A: 'a"b' });
	});

	it("skips a line with an empty name", () => {
		expect(parseDotenv("=1\nA=2")).toEqual({ A: "2" });
	});

	it("reads CRLF text", () => {
		expect(parseDotenv("A=1\r\nB=2\r\n")).toEqual({ A: "1", B: "2" });
	});
});
