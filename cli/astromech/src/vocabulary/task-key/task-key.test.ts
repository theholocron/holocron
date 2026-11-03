import { describe, expect, it } from "vitest";

import { isLegacySpelling, taskKey } from "./task-key.js";

describe("taskKey", () => {
	it("is the script spelling of the id for an entry written with a flat id", () => {
		expect(taskKey("test:unit", "test:unit")).toBe("test:unit");
		expect(taskKey("deploy-preview", "deploy-preview")).toBe("deploy:preview");
	});

	it("is the old name for an entry written with the dotted name that stood for that id alone", () => {
		expect(taskKey("verification.unitTests", "test:unit")).toBe("verification.unitTests");
		expect(taskKey("delivery.previewDeploy", "deploy-preview")).toBe("delivery.previewDeploy");
	});

	it("is the id for a successor of an old name that stood for several", () => {
		expect(taskKey("sourceQuality.formatting", "lint:markdown")).toBe("lint:markdown");
		expect(taskKey("sourceQuality.formatting", "format")).toBe("format");
	});
});

describe("isLegacySpelling", () => {
	it("tells an old dotted name from a flat id", () => {
		expect(isLegacySpelling("verification.unitTests")).toBe(true);
		expect(isLegacySpelling("test:unit")).toBe(false);
		expect(isLegacySpelling("preview")).toBe(false);
	});
});
