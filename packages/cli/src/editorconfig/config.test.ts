import { describe, expect, it } from "vitest";

import editorconfigChecker from "../templates/configs/editorconfig-checker/editorconfig-checker.json" with { type: "json" };
import { EDITORCONFIG_CHECKER_EXCLUDE, isEditorConfigExcluded } from "./config.js";

describe("EDITORCONFIG_CHECKER_EXCLUDE (holocron#927)", () => {
	it("is the generated .editorconfig-checker.json's own Exclude list, not a copy", () => {
		expect(EDITORCONFIG_CHECKER_EXCLUDE).toBe(editorconfigChecker.Exclude);
	});

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
