import { lint } from "markdownlint/promise";
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

	it("requires a language on every fenced code block, as a warning", () => {
		expect(config["fenced-code-language"]).toEqual({ severity: "warning" });
	});

	it("flags a real fenced code block with no language, in real lint output", async () => {
		const results = await lint({ strings: { doc: "```\nconst x = 1;\n```\n" }, config });
		expect(results.doc?.some((m) => m.ruleNames.includes("MD040"))).toBe(true);
	});

	it("doesn't flag a fenced code block that has a language", async () => {
		const results = await lint({ strings: { doc: "```ts\nconst x = 1;\n```\n" }, config });
		expect(results.doc?.some((m) => m.ruleNames.includes("MD040"))).toBe(false);
	});

	describe("severity curation (full rationale: docs/wiki/standards/markdownlint-rule-severity.md)", () => {
		it("keeps cosmetic/subjective/non-breaking rules enabled but downgrades them to warning", () => {
			const warningRules = [
				"fenced-code-language",
				"ul-style",
				"commands-show-output",
				"no-trailing-punctuation",
				"no-bare-urls",
				"no-emphasis-as-heading",
				"no-space-in-code",
				"no-space-in-links",
				"code-block-style",
				"link-image-reference-definitions",
				"descriptive-link-text",
			];
			for (const rule of warningRules) {
				expect(config[rule]).toEqual({ severity: "warning" });
			}
		});

		it("disables rules that duplicate another check or another already-disabled rule's own reasoning", () => {
			const disabledRules = [
				"single-trailing-newline",
				"link-image-style",
				"table-pipe-style",
				"blanks-around-tables",
				"table-column-style",
			];
			for (const rule of disabledRules) {
				expect(config[rule]).toBe(false);
			}
		});

		it("leaves rules with real breakage (broken links, broken rendering, accessibility) untouched -- markdownlint's own default error severity applies", () => {
			const untouchedErrorRules = [
				"heading-increment",
				"no-reversed-links",
				"single-title",
				"no-space-in-emphasis",
				"no-empty-links",
				"no-alt-text",
				"link-fragments",
				"reference-links-images",
				"table-column-count",
			];
			for (const rule of untouchedErrorRules) {
				expect(config[rule]).toBeUndefined();
			}
		});

		it("configures duplicate-heading (still error-severity) without a severity override", () => {
			expect(config["duplicate-heading"]).toEqual({ siblings_only: true });
		});

		it("produces real warning-severity (not error) lint output for a downgraded rule", async () => {
			const results = await lint({ strings: { doc: "* item one\n- item two\n" }, config });
			const finding = results.doc?.find((m) => m.ruleNames.includes("MD004"));
			expect(finding?.severity).toBe("warning");
		});

		it("no longer flags single-trailing-newline at all now that it's disabled", async () => {
			const results = await lint({ strings: { doc: "# Title\n\nNo trailing newline." }, config });
			expect(results.doc?.some((m) => m.ruleNames.includes("MD047"))).toBe(false);
		});
	});
});
