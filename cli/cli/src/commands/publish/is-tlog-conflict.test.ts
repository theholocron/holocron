import { describe, expect, it } from "vitest";

import { isTlogConflict } from "./is-tlog-conflict.js";

describe("isTlogConflict", () => {
	it("matches the error code", () => {
		expect(isTlogConflict("npm error code TLOG_CREATE_ENTRY_ERROR")).toBe(true);
	});

	it("matches the message without the code", () => {
		expect(isTlogConflict("(409) an equivalent entry already exists in the transparency log with UUID abc")).toBe(
			true
		);
	});

	it("does not match a registry E409 or other failures", () => {
		expect(isTlogConflict("E409 cannot publish over previously published version")).toBe(false);
		expect(isTlogConflict("EOTP")).toBe(false);
		expect(isTlogConflict("")).toBe(false);
	});
});
