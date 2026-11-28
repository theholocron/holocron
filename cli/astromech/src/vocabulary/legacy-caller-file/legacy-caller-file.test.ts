import { describe, expect, it } from "vitest";

import { legacyCallerFile } from "./legacy-caller-file.js";

describe("legacyCallerFile", () => {
	it("is the old task name and .yml", () => {
		expect(legacyCallerFile("test:unit")).toBe("verification.unitTests.yml");
		expect(legacyCallerFile("lint:editorconfig")).toBe("sourceQuality.formatting.yml");
		expect(legacyCallerFile("mark-stale")).toBe("stale.yml");
	});

	it("keeps the id of a task that had no old name", () => {
		expect(legacyCallerFile("preview")).toBe("preview.yml");
	});
});
