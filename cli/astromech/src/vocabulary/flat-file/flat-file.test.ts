import { describe, expect, it } from "vitest";

import { flatFile } from "./flat-file.js";

describe("flatFile", () => {
	it("gives the flat file name of an old reusable", () => {
		expect(flatFile("verification.unitTests.yml")).toBe("test-unit.yml");
		expect(flatFile("sourceQuality.formatting.yml")).toBe("lint-editorconfig.yml");
		expect(flatFile("bookkeeping.yml")).toBe("label.yml");
		expect(flatFile("platform.repoValidation.yml")).toBe("validate.yml");
	});

	it("returns a file that is already flat, or has no old name, as it is", () => {
		expect(flatFile("test-unit.yml")).toBe("test-unit.yml");
		expect(flatFile("preview.yml")).toBe("preview.yml");
		expect(flatFile("tag.yml")).toBe("tag.yml");
	});
});
