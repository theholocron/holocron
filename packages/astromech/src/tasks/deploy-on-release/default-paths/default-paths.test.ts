import { describe, expect, it } from "vitest";

import { TREE } from "../test-fixtures.js";
import { workspacePackages } from "../workspace-packages/index.js";
import { defaultPaths } from "./default-paths.js";

describe("defaultPaths", () => {
	const all = workspacePackages("/repo", TREE);

	it("derives paths: the package plus each workspace dependency's folder", () => {
		const [app] = all as [(typeof all)[number]];
		expect(defaultPaths("/repo", app, all)).toEqual(["packages/app/", "packages/cli/", "packages/datapad/"]);
	});

	it("derives just the package's folder when it has no workspace dependencies", () => {
		const cli = all.find((p) => p.name === "@theholocron/cli") as (typeof all)[number];
		expect(defaultPaths("/repo", cli, all)).toEqual(["packages/cli/"]);
	});
});
