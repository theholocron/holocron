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

describe("an old hyphen id that suite membership renamed", () => {
	it("is keyed like the flat id, since its script spelling is the same", () => {
		expect(isLegacySpelling("measure-docs")).toBe(false);
		expect(taskKey("measure-docs", "measure:docs")).toBe("measure:docs");
		expect(taskKey("measure-bundle", "measure:bundle")).toBe("measure:bundle");
	});

	it("leaves the dotted name of the same task as the old key", () => {
		expect(taskKey("delivery.bundleSize", "measure:bundle")).toBe("delivery.bundleSize");
	});
});

describe("isLegacySpelling", () => {
	it("tells an old dotted name from a flat id", () => {
		expect(isLegacySpelling("verification.unitTests")).toBe(true);
		expect(isLegacySpelling("test:unit")).toBe(false);
		expect(isLegacySpelling("preview")).toBe(false);
	});
});
