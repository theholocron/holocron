import { describe, expect, it } from "vitest";

import { TREE, VERSION } from "../test-fixtures.js";
import type { WorkspacePackage } from "../workspace-packages/index.js";
import { workspacePackages } from "../workspace-packages/index.js";
import { workspaceDependencies } from "./workspace-dependencies.js";

function pkg(name: string, overrides: Partial<WorkspacePackage> = {}): WorkspacePackage {
	return {
		name,
		dir: `/repo/packages/${name.split("/").pop()}`,
		version: "1.0.0",
		dependencies: {},
		devDependencies: {},
		...overrides,
	};
}

describe("workspaceDependencies", () => {
	const all = workspacePackages("/repo", TREE);

	it("finds each workspace:* dependency, skipping npm dependencies and unrelated packages", () => {
		const [app] = all as [(typeof all)[number]];
		expect(workspaceDependencies(app, all).map((d) => [d.name, d.version])).toEqual([
			["@theholocron/cli", VERSION],
			["@theholocron/datapad", VERSION],
		]);
	});

	it("traverses transitively: a dependency's own dependency is included too (holocron#1071)", () => {
		const c = pkg("@demo/c");
		const b = pkg("@demo/b", { dependencies: { "@demo/c": "workspace:*" } });
		const a = pkg("@demo/a", { dependencies: { "@demo/b": "workspace:*" } });
		expect(workspaceDependencies(a, [a, b, c]).map((d) => d.name)).toEqual(["@demo/b", "@demo/c"]);
	});

	it("counts a workspace:* devDependency, not just dependencies (holocron#1071)", () => {
		const tsconfig = pkg("@demo/tsconfig");
		const app = pkg("@demo/app", { devDependencies: { "@demo/tsconfig": "workspace:*" } });
		expect(workspaceDependencies(app, [app, tsconfig]).map((d) => d.name)).toEqual(["@demo/tsconfig"]);
	});

	it("includes a transitive devDependency too, not only the direct one", () => {
		const tsconfig = pkg("@demo/tsconfig");
		const buildTool = pkg("@demo/build-tool", { devDependencies: { "@demo/tsconfig": "workspace:*" } });
		const app = pkg("@demo/app", { devDependencies: { "@demo/build-tool": "workspace:*" } });
		expect(workspaceDependencies(app, [app, buildTool, tsconfig]).map((d) => d.name)).toEqual([
			"@demo/build-tool",
			"@demo/tsconfig",
		]);
	});

	it("includes a shared transitive dependency only once (diamond dependency)", () => {
		const shared = pkg("@demo/shared");
		const b = pkg("@demo/b", { dependencies: { "@demo/shared": "workspace:*" } });
		const c = pkg("@demo/c", { dependencies: { "@demo/shared": "workspace:*" } });
		const a = pkg("@demo/a", { dependencies: { "@demo/b": "workspace:*", "@demo/c": "workspace:*" } });
		const names = workspaceDependencies(a, [a, b, c, shared]).map((d) => d.name);
		expect(names).toEqual(["@demo/b", "@demo/c", "@demo/shared"]);
		expect(names.filter((n) => n === "@demo/shared")).toHaveLength(1);
	});

	it("doesn't loop forever on a dependency cycle", () => {
		const a: WorkspacePackage = pkg("@demo/a", { dependencies: { "@demo/b": "workspace:*" } });
		const b: WorkspacePackage = pkg("@demo/b", { dependencies: { "@demo/a": "workspace:*" } });
		expect(workspaceDependencies(a, [a, b]).map((d) => d.name)).toEqual(["@demo/b"]);
	});

	it("still skips a non-workspace dependency transitively", () => {
		const b = pkg("@demo/b", { dependencies: { yaml: "2.9.0" } });
		const a = pkg("@demo/a", { dependencies: { "@demo/b": "workspace:*" } });
		expect(workspaceDependencies(a, [a, b]).map((d) => d.name)).toEqual(["@demo/b"]);
	});
});
