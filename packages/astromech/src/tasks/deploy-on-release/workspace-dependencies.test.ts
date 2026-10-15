import { describe, expect, it } from "vitest";

import { TREE, VERSION } from "./test-fixtures.js";
import { workspaceDependencies } from "./workspace-dependencies.js";
import { workspacePackages } from "./workspace-packages.js";

describe("workspaceDependencies", () => {
	const all = workspacePackages("/repo", TREE);

	it("finds each workspace:* dependency, skipping npm dependencies and unrelated packages", () => {
		const [app] = all as [(typeof all)[number]];
		expect(workspaceDependencies(app, all).map((d) => [d.name, d.version])).toEqual([
			["@theholocron/cli", VERSION],
			["@theholocron/datapad", VERSION],
		]);
	});
});
