import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { sameText, signHex } from "./hmac.js";

describe("signHex", () => {
	it("is the hex HMAC-SHA256 of the text under the secret", async () => {
		const expected = createHmac("sha256", "secret").update("body").digest("hex");
		expect(await signHex("secret", "body")).toBe(expected);
	});

	it("differs for another secret or another body", async () => {
		expect(await signHex("other", "body")).not.toBe(await signHex("secret", "body"));
		expect(await signHex("secret", "bodz")).not.toBe(await signHex("secret", "body"));
	});
});

describe("sameText", () => {
	it("is true only for identical text", () => {
		expect(sameText("abc", "abc")).toBe(true);
		expect(sameText("abc", "abd")).toBe(false);
		expect(sameText("abc", "ab")).toBe(false);
		expect(sameText("", "")).toBe(true);
	});
});
