import { describe, expect, it } from "vitest";

import { pad, statusRow } from "./status-row.js";

describe("pad", () => {
	it("right-pads to the given width", () => {
		expect(pad("ok", 5)).toBe("ok   ");
	});

	it("never truncates a string already at or past the width", () => {
		expect(pad("already-long", 5)).toBe("already-long");
		expect(pad("exact", 5)).toBe("exact");
	});
});

describe("statusRow", () => {
	it("joins columns with a two-space gap, indented, with the ok icon", () => {
		expect(statusRow("ok", ["a", "b", "c"])).toBe("  ✓ a  b  c");
	});

	it("drops blank columns instead of leaving a trailing gap", () => {
		expect(statusRow("ok", ["a", "", "c"])).toBe("  ✓ a  c");
		expect(statusRow("ok", ["a", ""])).toBe("  ✓ a");
	});

	it("uses the fail icon for status fail and the skip dot for status skip", () => {
		expect(statusRow("fail", ["x"])).toBe("  ✗ x");
		expect(statusRow("skip", ["x"])).toBe("  · x");
	});
});
