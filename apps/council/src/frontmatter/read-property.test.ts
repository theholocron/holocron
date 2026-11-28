import { describe, expect, it } from "vitest";

import { readProperty } from "./read-property.js";

describe("readProperty", () => {
	it("reads a plain value", () => {
		expect(readProperty("---\nstatus: seed\n---\nbody", "status")).toBe("seed");
	});

	it("reads CRLF notes and a byte order mark", () => {
		expect(readProperty("﻿---\r\nstatus: exploring\r\n---\r\n", "status")).toBe("exploring");
	});

	it("drops quotes and a trailing comment", () => {
		expect(readProperty('---\nissue: "#12" # filed\n---\n', "issue")).toBe("#12");
		expect(readProperty("---\nissue: 'ENG-4'\n---\n", "issue")).toBe("ENG-4");
	});

	it("treats empty, null and tilde values as missing", () => {
		for (const value of ["", '""', "null", "~"]) {
			expect(readProperty(`---\nissue: ${value}\n---\n`, "issue")).toBeUndefined();
		}
		expect(readProperty("---\nissue:\n---\n", "issue")).toBeUndefined();
	});

	it("returns undefined without frontmatter, without the key or past the closing fence", () => {
		expect(readProperty("status: seed", "status")).toBeUndefined();
		expect(readProperty("---\ntitle: x\n---\n", "status")).toBeUndefined();
		expect(readProperty("---\ntitle: x\n---\nstatus: seed\n", "status")).toBeUndefined();
		expect(readProperty("---\ntitle: x\n...\nstatus: seed\n", "status")).toBeUndefined();
		expect(readProperty("", "status")).toBeUndefined();
		expect(readProperty("---\ntitle: x\n", "status")).toBeUndefined();
	});

	it("does not match a key that only starts the same, or an indented line", () => {
		expect(readProperty("---\nstatuses: a\n  status: b\n---\n", "status")).toBeUndefined();
	});
});
