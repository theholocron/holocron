import { describe, expect, it } from "vitest";

import { defaultPaths } from "./default-paths.js";
import { TREE } from "./test-fixtures.js";
import { workspacePackages } from "./workspace-packages.js";

describe("defaultPaths", () => {
	const all = workspacePackages("/repo", TREE);

	it("derives paths: the package plus each workspace dependency's folder", () => {
		const [app] = all as [(typeof all)[number]];
		expect(defaultPaths("/repo", app, all)).toEqual(["packages/app/", "packages/cli/", "packages/datapad/"]);
	});

	it("derives just the package's folder when it has no workspace dependencies", () => {
		const cli = all[1] as (typeof all)[number];
		expect(defaultPaths("/repo", cli, all)).toEqual(["packages/cli/"]);
	});
});
