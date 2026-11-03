import { describe, expect, it } from "vitest";

import { isTask } from "../is-task/index.js";
import { resolveTaskName } from "./resolve-task-name.js";

describe("resolveTaskName", () => {
	it("a flat id stands for itself, and so does a workflow-only id", () => {
		expect(resolveTaskName("test:unit")).toEqual([{ id: "test:unit" }]);
		expect(resolveTaskName("deploy-preview")).toEqual([{ id: "deploy-preview" }]);
		expect(resolveTaskName("label")).toEqual([{ id: "label" }]);
	});

	it("an old dotted name stands for its successors", () => {
		expect(resolveTaskName("verification.typeSafety")).toEqual([{ id: "typecheck" }]);
		expect(resolveTaskName("sourceQuality.formatting").map((t) => t.id)).toEqual([
			"lint:editorconfig",
			"lint:markdown",
			"format",
		]);
	});

	it("the script spelling of a hyphen compound is the id", () => {
		expect(resolveTaskName("deploy:preview")).toEqual([{ id: "deploy-preview" }]);
		expect(resolveTaskName("sync:repo")).toEqual([{ id: "sync-repo" }]);
	});

	it("a suite, an unknown name and an unknown script spelling stand for nothing", () => {
		expect(resolveTaskName("test")).toEqual([]);
		expect(resolveTaskName("nope")).toEqual([]);
		expect(resolveTaskName("nope:thing")).toEqual([]);
	});
});

describe("isTask", () => {
	it("is true for the id and for any old name that stands for it", () => {
		expect(isTask("release", "release")).toBe(true);
		expect(isTask("delivery.publish", "release")).toBe(true);
		expect(isTask("sourceQuality.formatting", "format")).toBe(true);
	});

	it("is false for another task and for a name that is nothing", () => {
		expect(isTask("delivery.build", "release")).toBe(false);
		expect(isTask("nope", "release")).toBe(false);
	});
});
