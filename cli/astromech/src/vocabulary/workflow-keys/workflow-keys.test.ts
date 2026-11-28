import { describe, expect, it } from "vitest";

import { workflowKeys } from "./workflow-keys.js";

describe("workflowKeys", () => {
	it("is one key for a name that stands for one id", () => {
		expect(workflowKeys("test:unit")).toEqual(["test:unit"]);
		expect(workflowKeys("verification.unitTests")).toEqual(["test:unit"]);
	});

	it("leaves out a task with no workflow of its own: the old formatting name is editorconfig and markdown, not format", () => {
		expect(workflowKeys("sourceQuality.formatting")).toEqual(["lint:editorconfig", "lint:markdown"]);
		expect(workflowKeys("format")).toEqual(["lint:code"]);
	});

	it("is one key per workflow for a name whose successors have their own", () => {
		expect(workflowKeys("validate")).toEqual(["validate:specs", "validate:docs"]);
		expect(workflowKeys("platform.repoValidation")).toEqual(["validate:specs", "validate:docs"]);
		expect(workflowKeys("validate:docs")).toEqual(["validate:docs"]);
	});

	it("is the name itself when it stands for no id", () => {
		expect(workflowKeys("nope")).toEqual(["nope"]);
	});
});
