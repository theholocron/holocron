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

	it("never emits a backslash, even when relative() would return one (holocron#1069)", () => {
		// node:path's relative() uses the host's native separator -- on
		// Windows that's "\", which the paths-filter step and GitHub's
		// PR-files API (both forward-slash-only) would never match. A
		// literal backslash in a directory NAME is a legal (if unusual)
		// POSIX filename character, used here to force that branch
		// deterministically without needing an actual Windows host.
		const pkg = {
			name: "@demo/weird",
			dir: "/repo/packages/weird\\dir",
			version: "1.0.0",
			dependencies: {},
			devDependencies: {},
		};
		expect(defaultPaths("/repo", pkg, [pkg])).toEqual(["packages/weird/dir/"]);
	});

	it("includes a transitive and a devDependency's folder, not just direct dependencies (holocron#1071)", () => {
		const tsconfig = {
			name: "@demo/tsconfig",
			dir: "/repo/packages/tsconfig",
			version: "1.0.0",
			dependencies: {},
			devDependencies: {},
		};
		const shared = {
			name: "@demo/shared",
			dir: "/repo/packages/shared",
			version: "1.0.0",
			dependencies: {},
			devDependencies: { "@demo/tsconfig": "workspace:*" },
		};
		const app = {
			name: "@demo/app",
			dir: "/repo/packages/app",
			version: "1.0.0",
			dependencies: { "@demo/shared": "workspace:*" },
			devDependencies: {},
		};
		expect(defaultPaths("/repo", app, [app, shared, tsconfig])).toEqual([
			"packages/app/",
			"packages/shared/",
			"packages/tsconfig/",
		]);
	});
});
