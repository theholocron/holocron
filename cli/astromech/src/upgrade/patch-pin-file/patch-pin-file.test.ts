import { describe, expect, it } from "vitest";

import { patchPinFile } from "./patch-pin-file.js";

describe("patchPinFile", () => {
	it("rewrites a bare major and a full version", () => {
		expect(patchPinFile("20\n", 20, 22)).toBe("22\n");
		expect(patchPinFile("20.11.0", 20, 22)).toBe("22\n");
	});

	it("returns null for another major, including one that merely starts with the digits", () => {
		expect(patchPinFile("18\n", 20, 22)).toBeNull();
		expect(patchPinFile("200\n", 20, 22)).toBeNull();
	});
});
