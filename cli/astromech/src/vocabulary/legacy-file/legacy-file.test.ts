import { describe, expect, it } from "vitest";

import { flatFile } from "../flat-file/index.js";
import { LEGACY_NAMES } from "../legacy-names/index.js";
import { legacyFile } from "./legacy-file.js";

describe("legacyFile", () => {
	it("gives the old file name of a flat reusable", () => {
		expect(legacyFile("test-unit.yml")).toBe("verification.unitTests.yml");
		expect(legacyFile("typecheck.yml")).toBe("verification.typeSafety.yml");
		expect(legacyFile("mark-stale.yml")).toBe("stale.yml");
		expect(legacyFile("check-dispatched.yml")).toBe("platform.dispatchedCheck.yml");
	});

	it("gives the formatting workflow's name to its first successor, which carries it", () => {
		expect(legacyFile("lint-editorconfig.yml")).toBe("sourceQuality.formatting.yml");
	});

	it("returns a file with no old name as it is", () => {
		expect(legacyFile("preview.yml")).toBe("preview.yml");
		expect(legacyFile("ci.yml")).toBe("ci.yml");
	});

	it("is undone by flatFile for every old name", () => {
		for (const legacy of Object.keys(LEGACY_NAMES)) {
			expect(legacyFile(flatFile(`${legacy}.yml`))).toBe(`${legacy}.yml`);
		}
	});
});
