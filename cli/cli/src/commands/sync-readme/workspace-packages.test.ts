import type { WorkspacePackageEntry } from "@theholocron/pkg-utils";
import { describe, expect, it } from "vitest";

import { workspacePackages } from "./workspace-packages.js";

function entry(name: string | undefined, manifest: WorkspacePackageEntry["manifest"]): WorkspacePackageEntry {
	return { name, dir: `/repo/${name ?? "x"}`, relativeDir: name ?? "x", manifest: { name, ...manifest } };
}

describe("workspacePackages", () => {
	it("lists the public packages, sorted by name, with their homepage and npm page", () => {
		const rows = workspacePackages("/repo", () => [
			entry("@theholocron/b", { homepage: "https://docs/b" }),
			entry("@theholocron/a", { homepage: "https://docs/a" }),
		]);
		expect(Object.keys(rows!)).toEqual(["@theholocron/a", "@theholocron/b"]);
		expect(rows!["@theholocron/a"]).toEqual({
			package: "@theholocron/a",
			docsUrl: "https://docs/a",
			npmUrl: "https://www.npmjs.com/package/@theholocron/a",
		});
	});

	it("leaves out private and unnamed packages", () => {
		const rows = workspacePackages("/repo", () => [
			entry("@theholocron/site", { private: true }),
			entry(undefined, {}),
			entry("@theholocron/lib", {}),
		]);
		expect(Object.keys(rows!)).toEqual(["@theholocron/lib"]);
		expect(rows!["@theholocron/lib"]!.docsUrl).toBe("");
	});

	it("returns undefined when there is no public package", () => {
		expect(workspacePackages("/repo", () => [entry("@theholocron/site", { private: true })])).toBeUndefined();
		expect(workspacePackages("/repo", () => [])).toBeUndefined();
	});

	it("scans the real workspace by default", () => {
		expect(workspacePackages(process.cwd().replace(/\/cli\/cli$/, ""))).toBeDefined();
	});
});
