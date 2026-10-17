import { describe, expect, it } from "vitest";

import editorconfigChecker from "../../templates/configs/editorconfig-checker/editorconfig-checker.json" with { type: "json" };
import { EDITORCONFIG_CHECKER_EXCLUDE } from "./editorconfig-checker-exclude.js";

describe("EDITORCONFIG_CHECKER_EXCLUDE (holocron#927)", () => {
	it("is the generated .editorconfig-checker.json's own Exclude list, not a copy", () => {
		expect(EDITORCONFIG_CHECKER_EXCLUDE).toBe(editorconfigChecker.Exclude);
	});
});
