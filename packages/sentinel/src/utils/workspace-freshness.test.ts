import { describe, expect, it } from "vitest";

import { staleWorkspaceDeps } from "../../scripts/workspace-freshness.mjs";

const ASTROMECH = { name: "@theholocron/astromech", version: "5.0.0-alpha.99", dir: "packages/astromech" };

/** A fake `git`: known tags verify; `diff` returns the files listed for that tag. */
function fakeGit(tags: Record<string, string[]>) {
	const calls: string[][] = [];
	const git = (args: string[]) => {
		calls.push(args);
		if (args[0] === "rev-parse") {
			return { status: args[3]!.replace("refs/tags/", "") in tags ? 0 : 1, stdout: "" };
		}
		return { status: 0, stdout: (tags[args[2]!] ?? []).map((f) => `${f}\n`).join("") };
	};
	return { git, calls };
}

describe("staleWorkspaceDeps (holocron#919)", () => {
	it("passes a dependency whose source matches its release tag", () => {
		const { git } = fakeGit({ "v5.0.0-alpha.99": [] });
		expect(staleWorkspaceDeps({ deps: [ASTROMECH], git })).toEqual([]);
	});

	it("flags a dependency whose source moved past its release tag, naming the files", () => {
		const { git } = fakeGit({
			"v5.0.0-alpha.99": ["packages/astromech/src/config/index.ts", "packages/astromech/src/config/load.ts"],
		});
		expect(staleWorkspaceDeps({ deps: [ASTROMECH], git })).toEqual([
			"@theholocron/astromech@5.0.0-alpha.99: 2 file(s) changed since v5.0.0-alpha.99 was published (packages/astromech/src/config/index.ts, packages/astromech/src/config/load.ts)",
		]);
	});

	it("diffs only the published surface: src/ and package.json, tests excluded, against the working tree", () => {
		const { git, calls } = fakeGit({ "v5.0.0-alpha.99": [] });
		staleWorkspaceDeps({ deps: [ASTROMECH], git });
		expect(calls[1]).toEqual([
			"diff",
			"--name-only",
			"v5.0.0-alpha.99",
			"--",
			"packages/astromech/src",
			"packages/astromech/package.json",
			":(exclude,glob)**/*.test.ts",
		]);
	});

	it("refuses rather than guess when the release tag isn't available locally", () => {
		const { git } = fakeGit({});
		expect(staleWorkspaceDeps({ deps: [ASTROMECH], git })).toEqual([
			"@theholocron/astromech@5.0.0-alpha.99: no local tag v5.0.0-alpha.99 to compare against — run `git fetch --tags`",
		]);
	});

	it("checks every dependency and reports each problem", () => {
		const { git } = fakeGit({ "v5.0.0-alpha.99": ["packages/astromech/src/x.ts"] });
		const datapad = { name: "@theholocron/datapad", version: "5.0.0-alpha.98", dir: "packages/datapad" };
		expect(staleWorkspaceDeps({ deps: [ASTROMECH, datapad], git })).toHaveLength(2);
	});
});
