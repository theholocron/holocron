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
		).toEqual([
			"typecheck / Run tsc --noEmit",
			"lint:code / Run eslint, actionlint and prettier",
			"test:unit / Conclusion",
		]);
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
			"lint:code / Run eslint, actionlint and prettier",
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
			"lint:code / Run eslint, actionlint and prettier",
			"codecov/patch",
			"codecov/project",
			"tsdown (every workspace)",
		]);
	});

	it("de-duplicates a context that appears as both a task context and an extra", () => {
		expect(
			taskCheckContexts({
				tasks: [{ name: "sourceQuality.staticAnalysis", required: true }],
				extraRequiredChecks: ["lint:code / Run eslint, actionlint and prettier", "codecov/patch"],
			})
		).toEqual(["lint:code / Run eslint, actionlint and prettier", "codecov/patch"]);
	});

	it("ignores a required task with no known check context", () => {
		expect(taskCheckContexts({ tasks: [{ name: "delivery.deploy", required: true }] })).toEqual([]);
	});

	it("gives a task spelled with a flat id the context of its own workflow", () => {
		expect(
			taskCheckContexts({
				tasks: [
					{ name: "typecheck", required: true },
					{ name: "lint:markdown", required: true },
				],
			})
		).toEqual(["typecheck / Run tsc --noEmit", "lint:markdown / Run markdownlint"]);
	});

	it("gives each half of the old formatting workflow its own context, and `format` the one of `lint:code`", () => {
		expect(
			taskCheckContexts({
				tasks: [
					{ name: "format", required: true },
					{ name: "lint:markdown", required: true },
					{ name: "lint:editorconfig", required: true },
					{ name: "lint:code", required: true },
				],
			})
		).toEqual([
			"lint:code / Run eslint, actionlint and prettier",
			"lint:editorconfig / Run editorconfig-checker",
			"lint:markdown / Run markdownlint",
		]);
	});

	it("accepts a bare string task (never required)", () => {
		expect(taskCheckContexts({ tasks: ["sourceQuality.staticAnalysis"], extraRequiredChecks: ["X"] })).toEqual([
			"X",
		]);
	});
});
