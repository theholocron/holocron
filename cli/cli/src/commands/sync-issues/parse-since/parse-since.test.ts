import { describe, expect, it } from "vitest";

import { ConfigError } from "../../../config/index.js";
import { parseSince } from "./parse-since.js";

const NOW = Date.parse("2026-03-10T12:00:00Z");

describe("parseSince", () => {
	it("reads a span back from now", () => {
		expect(parseSince("30m", NOW)).toBe("2026-03-10T11:30:00.000Z");
		expect(parseSince("12h", NOW)).toBe("2026-03-10T00:00:00.000Z");
		expect(parseSince("7d", NOW)).toBe("2026-03-03T12:00:00.000Z");
		expect(parseSince("2w", NOW)).toBe("2026-02-24T12:00:00.000Z");
	});

	it("reads a date and a date with a time", () => {
		expect(parseSince("2026-03-01")).toBe("2026-03-01T00:00:00.000Z");
		expect(parseSince("2026-03-01T09:00:00Z")).toBe("2026-03-01T09:00:00.000Z");
	});

	it("defaults to the current time for a span", () => {
		expect(Date.parse(parseSince("1h"))).toBeLessThan(Date.now());
	});

	it("rejects what is neither, so a typo never reads as all", () => {
		expect(() => parseSince("yesterday")).toThrow(ConfigError);
		expect(() => parseSince("yesterday")).toThrow(/not a date or a span/);
	});
});
