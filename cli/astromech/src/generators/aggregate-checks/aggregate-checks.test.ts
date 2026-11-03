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
});
