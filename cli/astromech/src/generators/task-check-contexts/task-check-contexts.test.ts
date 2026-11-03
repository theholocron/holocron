import { describe, expect, it } from "vitest";

import { taskCheckContexts } from "./task-check-contexts.js";

describe("taskCheckContexts", () => {
	it("returns [] with no config", () => {
		expect(taskCheckContexts({})).toEqual([]);
	});

	it("returns [] when tasks exist but none are required", () => {
		expect(
			taskCheckContexts({
				tasks: ["sourceQuality.staticAnalysis", "verification.unitTests", { name: "verification.typeSafety" }],
			})
		).toEqual([]);
	});

	it("maps each required task to its check context", () => {
		expect(
			taskCheckContexts({
				tasks: [
					{ name: "sourceQuality.staticAnalysis", required: true },
					{ name: "verification.unitTests", required: true },
					{ name: "verification.typeSafety", required: true },
				],
			})
		).toEqual(["typecheck / Run tsc --noEmit", "lint:code / Run eslint and actionlint", "test:unit / Conclusion"]);
	});

	it("orders task contexts by CI_ORDER regardless of manifest order", () => {
		expect(
			taskCheckContexts({
				tasks: [
					{ name: "verification.unitTests", required: true },
					{ name: "verification.typeSafety", required: true },
					{ name: "sourceQuality.staticAnalysis", required: true },
					{ name: "delivery.bundleSize", required: true },
				],
			})
		).toEqual([
			"typecheck / Run tsc --noEmit",
			"lint:code / Run eslint and actionlint",
			"test:unit / Conclusion",
			"measure-bundle / Upload bundle stats to Codecov",
		]);
	});

	it("appends extraRequiredChecks after the task contexts, in declared order", () => {
		expect(
			taskCheckContexts({
				tasks: [{ name: "sourceQuality.staticAnalysis", required: true }],
				extraRequiredChecks: ["codecov/patch", "codecov/project", "tsdown (every workspace)"],
			})
		).toEqual([
			"lint:code / Run eslint and actionlint",
			"codecov/patch",
			"codecov/project",
			"tsdown (every workspace)",
		]);
	});

	it("de-duplicates a context that appears as both a task context and an extra", () => {
		expect(
			taskCheckContexts({
				tasks: [{ name: "sourceQuality.staticAnalysis", required: true }],
				extraRequiredChecks: ["lint:code / Run eslint and actionlint", "codecov/patch"],
			})
		).toEqual(["lint:code / Run eslint and actionlint", "codecov/patch"]);
	});

	it("ignores a required task with no known check context", () => {
		expect(taskCheckContexts({ tasks: [{ name: "delivery.deploy", required: true }] })).toEqual([]);
	});

	it("gives a task spelled with a flat id the context of the workflow it still posts under", () => {
		expect(
			taskCheckContexts({
				tasks: [
					{ name: "typecheck", required: true },
					{ name: "lint:markdown", required: true },
				],
			})
		).toEqual([
			"typecheck / Run tsc --noEmit",
			"lint:editorconfig / Run prettier, editorconfig-checker, markdownlint",
		]);
	});

	it("accepts a bare string task (never required)", () => {
		expect(taskCheckContexts({ tasks: ["sourceQuality.staticAnalysis"], extraRequiredChecks: ["X"] })).toEqual([
			"X",
		]);
	});
});
