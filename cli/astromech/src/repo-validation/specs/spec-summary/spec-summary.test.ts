import { describe, expect, it } from "vitest";

import { specSummary } from "./spec-summary.js";

describe("specSummary", () => {
	it("takes the first paragraph under a Problem heading, after the frontmatter and the title", () => {
		const text =
			"---\nstatus: proposed\n---\n\n# Title\n\nIntro that is skipped.\n\n## Problem\n\nThe server is built as code.\nBut its content is not.\n\nSecond paragraph.\n";

		expect(specSummary(text)).toBe("The server is built as code.\nBut its content is not.");
	});

	it("recognises Why, Context, Summary and Overview, at level two or three, in any case", () => {
		for (const heading of ["## Why", "### context", "## SUMMARY", "## Overview ##"]) {
			expect(specSummary(`# T\n\nIntro.\n\n${heading}\n\nThe point.\n`)).toBe("The point.");
		}
	});

	it("falls back to the first paragraph after the title when there is no such heading", () => {
		expect(specSummary("# Title\n\nOnly paragraph.\n\n## Design\n\nLater.\n")).toBe("Only paragraph.");
	});

	it("falls back the same way when the heading has nothing under it", () => {
		expect(specSummary("# Title\n\nFirst.\n\n## Problem\n")).toBe("First.");
	});

	it("skips headings, table rows and code fences while looking for a paragraph", () => {
		const text = "# T\n\n## Problem\n\n### Sub\n\n| a | b |\n| - | - |\n\n```ts\nx\n```\n\nReal text.\n";

		expect(specSummary(text)).toBe("Real text.");
	});

	it("keeps a bulleted block as it is", () => {
		expect(specSummary("# T\n\n## Problem\n\n- one\n- two\n\nAfter.\n")).toBe("- one\n- two");
	});

	it("is empty for a document with no paragraph", () => {
		expect(specSummary("# Only a title\n")).toBe("");
		expect(specSummary("")).toBe("");
	});

	it("cuts a long paragraph with an ellipsis at 1000 characters, and keeps one of exactly that length", () => {
		const long = specSummary(`# T\n\n## Problem\n\n${"x".repeat(1500)}\n`);
		const exact = "y".repeat(1000);

		expect(long).toHaveLength(1000);
		expect(long.endsWith("…")).toBe(true);
		expect(specSummary(`# T\n\n## Problem\n\n${exact}\n`)).toBe(exact);
	});
});

describe("specSummary — fenced blocks", () => {
	it("skips a fenced block whole, and one that never closes", () => {
		expect(specSummary("# T\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nProse after.\n")).toBe("Prose after.");
		expect(specSummary("# T\n\n```ts\nnever closed\n")).toBe("");
	});
});
