import { describe, expect, it } from "vitest";

import { deriveCapabilities, deriveCompliance, deriveProfile, deriveStack } from "./derived-properties.js";

describe("deriveProfile", () => {
	it("classifies a *-template repo as template regardless of package shape", () => {
		expect(
			deriveProfile({
				rootPackageJson: { bin: "cli" },
				repoName: "nextjs-template",
				isMonorepo: false,
				workspacePackageJsons: [],
			})
		).toBe("template");
	});

	it("classifies a monorepo whose primary published artifact is a CLI as platform", () => {
		// holocron's own real shape: root has no bin, but packages/cli does.
		expect(
			deriveProfile({
				rootPackageJson: { private: true },
				repoName: "holocron",
				isMonorepo: true,
				workspacePackageJsons: [{ name: "@theholocron/astromech" }, { name: "@theholocron/cli", bin: true }],
			})
		).toBe("platform");
	});

	it("does not classify a monorepo as platform when no workspace package has a bin", () => {
		expect(
			deriveProfile({
				rootPackageJson: { private: true },
				repoName: "clients",
				isMonorepo: true,
				workspacePackageJsons: [{ name: "@theholocron/github-client" }, { name: "@theholocron/http-client" }],
			})
		).not.toBe("platform");
	});

	it("classifies a single-package repo with a bin as cli", () => {
		expect(
			deriveProfile({
				rootPackageJson: { bin: "cli" },
				repoName: "some-tool",
				isMonorepo: false,
				workspacePackageJsons: [],
			})
		).toBe("cli");
	});

	it("classifies a private, astro-powered repo as docs", () => {
		expect(
			deriveProfile({
				rootPackageJson: { private: true, devDependencies: { "@theholocron/astro-config": "^8.0.0" } },
				repoName: "docs",
				isMonorepo: false,
				workspacePackageJsons: [],
			})
		).toBe("docs");
	});

	it("classifies a private, non-docs repo as app", () => {
		expect(
			deriveProfile({
				rootPackageJson: { private: true },
				repoName: "media-explorer",
				isMonorepo: false,
				workspacePackageJsons: [],
			})
		).toBe("app");
	});

	it("classifies a publishable single package as library", () => {
		expect(
			deriveProfile({
				rootPackageJson: { name: "@theholocron/utils", private: false },
				repoName: "utils",
				isMonorepo: false,
				workspacePackageJsons: [],
			})
		).toBe("library");
	});

	it("treats a missing root package.json as library (no bin, not private)", () => {
		expect(
			deriveProfile({
				rootPackageJson: null,
				repoName: "some-repo",
				isMonorepo: false,
				workspacePackageJsons: [],
			})
		).toBe("library");
	});
});

describe("deriveStack", () => {
	it("detects known frameworks/build tools present in dependencies", () => {
		expect(deriveStack({ dependencies: { next: "^15.0.0" }, devDependencies: { vitest: "^3.0.0" } })).toEqual([
			"next",
			"vitest",
		]);
	});

	it("detects tools declared only in devDependencies", () => {
		expect(deriveStack({ devDependencies: { tsdown: "^0.22.0", astro: "^5.0.0" } })).toEqual(["astro", "tsdown"]);
	});

	it("returns an empty list when nothing in the curated table matches", () => {
		expect(deriveStack({ dependencies: { lodash: "^4.0.0" } })).toEqual([]);
	});

	it("returns an empty list for a null package.json", () => {
		expect(deriveStack(null)).toEqual([]);
	});

	it("does not duplicate a dep present in both dependencies and devDependencies", () => {
		expect(deriveStack({ dependencies: { vite: "^7.0.0" }, devDependencies: { vite: "^7.0.0" } })).toEqual([
			"vite",
		]);
	});
});

const TUPLE = { provider: "github", packageName: "@theholocron/holocron-plugin-github", options: {} };

describe("deriveCapabilities", () => {
	it("returns the sorted provider keys", () => {
		expect(
			deriveCapabilities({
				ci: { cardinality: "single", tuple: TUPLE },
				source: { cardinality: "single", tuple: TUPLE },
			})
		).toEqual(["ci", "source"]);
	});

	it("returns an empty list when providers is undefined", () => {
		expect(deriveCapabilities(undefined)).toEqual([]);
	});

	it("returns an empty list when providers is an empty object", () => {
		expect(deriveCapabilities({})).toEqual([]);
	});
});

describe("deriveCompliance", () => {
	it("is compliant when both source and ci are present", () => {
		expect(deriveCompliance(["ci", "source", "deployment"])).toBe("compliant");
	});

	it("is non-compliant when ci is missing", () => {
		expect(deriveCompliance(["source"])).toBe("non-compliant");
	});

	it("is non-compliant when source is missing", () => {
		expect(deriveCompliance(["ci"])).toBe("non-compliant");
	});

	it("is non-compliant when capabilities is empty", () => {
		expect(deriveCompliance([])).toBe("non-compliant");
	});
});
