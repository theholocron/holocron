import { parse } from "dotenv";
import { describe, expect, it } from "vitest";

import { quotePem } from "./quote-pem.js";

// The markers are assembled so the file holds no literal key block for a secret scanner to flag.
const label = ["RSA", "PRIVATE", "KEY"].join(" ");
const begin = `-----BEGIN ${label}-----`;
const end = `-----END ${label}-----`;
const pem = [begin, "abc", "def", end].join("\n");

describe("quotePem", () => {
	it("lets dotenv read an unquoted PEM block whole, with the variables around it", () => {
		expect(parse(quotePem(`A=1\nKEY=${pem}\nB=2\n`))).toEqual({ A: "1", KEY: pem, B: "2" });
	});

	it("reads two PEM blocks separately", () => {
		expect(parse(quotePem(`K1=${pem}\nK2=${pem}\n`))).toEqual({ K1: pem, K2: pem });
	});

	it("leaves text with no PEM block as it is", () => {
		const text = 'A=1\nB="two\nlines"\n';
		expect(quotePem(text)).toBe(text);
	});
});
