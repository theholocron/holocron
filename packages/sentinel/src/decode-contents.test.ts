import { describe, expect, it } from "vitest";

import { decodeContents } from "./decode-contents.js";

describe("decodeContents", () => {
	it("decodes base64 content to a utf8 string", () => {
		const encoded = Buffer.from("hello world", "utf8").toString("base64");
		expect(decodeContents(encoded)).toBe("hello world");
	});

	it("round-trips non-ASCII content", () => {
		const original = 'export default { name: "café — 日本語" };';
		const encoded = Buffer.from(original, "utf8").toString("base64");
		expect(decodeContents(encoded)).toBe(original);
	});

	it("decodes an empty string to an empty string", () => {
		expect(decodeContents("")).toBe("");
	});
});
