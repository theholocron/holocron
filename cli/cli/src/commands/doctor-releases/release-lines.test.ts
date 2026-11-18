import { describe, expect, it } from "vitest";

import { releaseLines } from "./release-lines.js";

const packages = (scope: { group?: string; excludeGroups?: readonly string[] }): string[] => {
	if (scope.group === "ci") return [];
	if (scope.group) return [`@x/${scope.group}-a`];
	return [`@x/rest-excluding-${(scope.excludeGroups ?? []).join("+")}`];
};

describe("releaseLines", () => {
	it("makes one line per group and one for the rest, leaving out a group that publishes nothing", () => {
		const lines = releaseLines(
			{ tasks: [{ name: "release", with: { groups: ["configs", { name: "ci", "run-build": false }] } }] },
			{ packages }
		);
		expect(lines).toEqual([
			{ id: "configs", tagPrefix: "configs-v", packages: ["@x/configs-a"] },
			{ id: "repo", tagPrefix: "v", packages: ["@x/rest-excluding-configs+ci"] },
		]);
	});

	it("is a single repo-wide line with no groups", () => {
		expect(releaseLines({ tasks: [] }, { packages })).toEqual([
			{ id: "repo", tagPrefix: "v", packages: ["@x/rest-excluding-"] },
		]);
	});
});
