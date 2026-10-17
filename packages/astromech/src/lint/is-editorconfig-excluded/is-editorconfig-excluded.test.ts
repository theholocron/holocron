import { describe, expect, it } from "vitest";

import { isEditorConfigExcluded } from "./is-editorconfig-excluded.js";

describe("isEditorConfigExcluded (holocron#927)", () => {
	it("excludes markdown, LICENSE files and public/, at any depth where the pattern allows", () => {
		expect(isEditorConfigExcluded("README.md")).toBe(true);
		expect(isEditorConfigExcluded("packages/github-client/README.md")).toBe(true);
		expect(isEditorConfigExcluded("docs/page.mdx")).toBe(true);
		expect(isEditorConfigExcluded("LICENSE")).toBe(true);
		expect(isEditorConfigExcluded("packages/cli/LICENSE")).toBe(true);
		expect(isEditorConfigExcluded("public/logo.svg")).toBe(true);
	});

	it("keeps checking everything else", () => {
		expect(isEditorConfigExcluded("src/index.ts")).toBe(false);
		expect(isEditorConfigExcluded("docs/public/x.ts")).toBe(false);
		expect(isEditorConfigExcluded("LICENSE.ts")).toBe(false);
	});
});
