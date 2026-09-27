import { describe, expect, it } from "vitest";

import config from "./index.js";

describe("markdownlint-config", () => {
	it("exports a non-empty config object", () => {
		expect(typeof config).toBe("object");
		expect(Object.keys(config).length).toBeGreaterThan(0);
	});

	it("disables every rule that would conflict with Prettier's own markdown formatting", () => {
		expect(config["line-length"]).toBe(false);
		expect(config["emphasis-style"]).toBe(false);
		expect(config["strong-style"]).toBe(false);
		expect(config["no-multiple-blanks"]).toBe(false);
		expect(config["no-hard-tabs"]).toBe(false);
	});

	it("allows inline HTML (badges, <details>, <sub> throughout org docs)", () => {
		expect(config["no-inline-html"]).toBe(false);
	});

	it("doesn't require a leading H1 (spec files and doc partials routinely skip one)", () => {
		expect(config["first-line-heading"]).toBe(false);
	});

	it("only flags a duplicate heading at the same nesting level, not across levels", () => {
		expect(config["duplicate-heading"]).toEqual({ siblings_only: true });
	});
});
