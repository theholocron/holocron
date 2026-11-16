import { describe, expect, it } from "vitest";

import { aggregateChecks } from "./aggregate-checks.js";

describe("aggregateChecks", () => {
	it("waits on nothing for an empty manifest", () => {
		expect(aggregateChecks({})).toEqual({ expected: [], statuses: [] });
	});

	it("takes the id of each required task: the caller job name (the id) before ` / `", () => {
		expect(
			aggregateChecks({
				tasks: [
					{ name: "verification.typeSafety", required: true },
					{ name: "verification.unitTests", required: true },
					{ name: "sourceQuality.formatting" },
				],
			})
		).toEqual({ expected: ["typecheck", "test:unit"], statuses: [] });
	});

	it("waits on `lint:markdown` and `lint:editorconfig` separately, and on `lint:code` for `format`", () => {
		expect(
			aggregateChecks({
				tasks: [
					{ name: "lint:editorconfig", required: true },
					{ name: "lint:markdown", required: true },
					{ name: "format", required: true },
				],
			})
		).toEqual({ expected: ["lint:editorconfig", "lint:markdown", "lint:code"], statuses: [] });
	});

	it("sends the `codecov/` extras to `statuses` and the other extras to `expected` by their id", () => {
		expect(
			aggregateChecks({
				tasks: [{ name: "verification.typeSafety", required: true }],
				extraRequiredChecks: [
					"codecov/patch",
					"codecov/project",
					"codecov/patch/documentation",
					"Dependency catalogs / Check",
					"Generated files / Check",
				],
			})
		).toEqual({
			expected: ["typecheck", "Dependency catalogs", "Generated files"],
			statuses: ["codecov/patch", "codecov/project", "codecov/patch/documentation"],
		});
	});

	it("keeps an extra that has no ` / ` whole, drops `DCO`, and lists an id once", () => {
		expect(
			aggregateChecks({
				extraRequiredChecks: ["tsdown (every workspace)", "DCO", "Generated files / A", "Generated files / B"],
			})
		).toEqual({ expected: ["tsdown (every workspace)", "Generated files"], statuses: [] });
	});

	it("takes the statuses from the provider when it reports them, and adds its required ones", () => {
		expect(
			aggregateChecks(
				{
					tasks: [{ name: "verification.typeSafety", required: true }],
					extraRequiredChecks: ["cov/patch", "codecov/patch", "Generated files / Check"],
				},
				[
					{ name: "cov/patch", required: true },
					{ name: "cov/project", required: true },
					{ name: "cov/patch/a", required: false },
				]
			)
		).toEqual({
			expected: ["typecheck", "codecov/patch", "Generated files"],
			statuses: ["cov/patch", "cov/project"],
		});
	});
});
