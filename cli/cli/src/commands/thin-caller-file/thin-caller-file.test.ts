import { describe, expect, it } from "vitest";

import { thinCallerFile } from "./thin-caller-file.js";

describe("thinCallerFile", () => {
	it("is the header, the source package marker and the workflow", () => {
		expect(thinCallerFile("apps/web", "name: CI\non: push\n")).toBe(
			[
				"# AUTO-GENERATED — do not edit directly.",
				"# Source:  theholocron/holocron · cli/astromech/src/generators/github-action-thin-callers/github-action-thin-callers.ts",
				"# Tool:    holocron sync",
				"# Changes: edit source in theholocron/holocron",
				"# Source package: apps/web",
				"",
				"name: CI",
				"on: push",
				"",
			].join("\n")
		);
	});

	it("names `sync` as the tool whichever command writes the file, so both write the same bytes", () => {
		expect(thinCallerFile(".", "x")).toContain("# Tool:    holocron sync");
		expect(thinCallerFile(".", "x")).not.toContain("holocron repo setup");
	});
});
