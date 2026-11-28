import { describe, expect, it } from "vitest";

import { aggregateCaller } from "./aggregate-caller.js";

describe("aggregateCaller", () => {
	const yaml = aggregateCaller({ expected: ["typecheck", "test:unit"], statuses: ["codecov/patch"] });

	it("is a pull_request workflow with one job named `ci` that calls the reusable `ci.yml`", () => {
		expect(yaml).toContain("name: ci\n");
		expect(yaml).toContain("on: # yamllint disable-line rule:truthy\n  pull_request:\n");
		expect(yaml).toContain("  ci:\n    name: ci\n    uses: theholocron/.github/.github/workflows/ci.yml@main\n");
	});

	it("passes the ids and the statuses as quoted JSON", () => {
		expect(yaml).toContain(`      expected: '["typecheck","test:unit"]'\n`);
		expect(yaml).toContain(`      statuses: '["codecov/patch"]'\n`);
	});

	it("grants the reusable read access only", () => {
		expect(yaml).toContain("permissions:\n  checks: read\n  statuses: read\n  contents: read\n");
		expect(yaml).not.toContain("write");
	});

	it("cancels a superseded run of the same ref", () => {
		expect(yaml).toContain("group: ci-${{ github.ref }}\n  cancel-in-progress: true");
	});
});
