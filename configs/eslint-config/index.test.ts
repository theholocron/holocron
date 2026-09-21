import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Linter } from "eslint";
import { afterEach, describe, expect, it } from "vitest";

import libraryDefault from "./bundles/library.js";
import { library } from "./bundles/library.js";
import { base } from "./configs/base.js";
import { node } from "./configs/node.js";
import { packageJson } from "./configs/package-json.js";
import { react } from "./configs/react.js";
import { storybook } from "./configs/storybook.js";
import { typescript } from "./configs/typescript.js";

describe("eslint-config — individual configs", () => {
	it("base() returns a non-empty flat config array", () => {
		const config = base();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("base() includes the docs/src n/no-extraneous-import exception unconditionally", () => {
		const config = base();
		const docsSrc = config.find((c) => "name" in c && c.name === "@theholocron/docs-src");
		expect(docsSrc).toBeDefined();
		expect(docsSrc?.files).toContain("docs/src/**");
		expect(docsSrc?.rules?.["n/no-extraneous-import"]).toBe("off");
	});

	it("base() walks up from cwd to find the repo's .gitignore even when cwd is a nested package directory", () => {
		// packages/eslint-config has no .gitignore of its own — the repo ROOT
		// (configs/.gitignore) does. This is exactly the shape astromech's
		// resolver invokes eslint in for per-package fan-out (config-resolution
		// workstream, #676 in theholocron/holocron): cwd is the package
		// directory, not the repo root. A cwd-only check used to miss this
		// entirely — discovered when it let real dist/coverage build output
		// get linted in theholocron/clients#348.
		const config = base();
		const gitignore = config.find((c) => "name" in c && c.name === "@theholocron/gitignore");
		expect(gitignore).toBeDefined();
		expect(gitignore?.ignores).toContain("**/dist");
	});

	describe("base() with a .gitignore present", () => {
		let tmpDir: string | undefined;
		let originalCwd: string;

		afterEach(() => {
			process.chdir(originalCwd);
			if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
			tmpDir = undefined;
		});

		it("includes an @theholocron/gitignore config derived from cwd's own .gitignore", () => {
			originalCwd = process.cwd();
			tmpDir = mkdtempSync(join(tmpdir(), "eslint-config-gitignore-"));
			writeFileSync(join(tmpDir, ".gitignore"), "dist/\ncoverage/\n");
			process.chdir(tmpDir);

			const config = base();
			const gitignore = config.find((c) => "name" in c && c.name === "@theholocron/gitignore");
			expect(gitignore).toBeDefined();
			expect(gitignore?.ignores).toContain("**/dist/");
		});

		it("finds a .gitignore in a parent directory when cwd itself has none", () => {
			originalCwd = process.cwd();
			tmpDir = mkdtempSync(join(tmpdir(), "eslint-config-gitignore-parent-"));
			writeFileSync(join(tmpDir, ".gitignore"), "dist/\ncoverage/\n");
			const nested = join(tmpDir, "packages", "some-package");
			mkdirSync(nested, { recursive: true });
			process.chdir(nested);

			const config = base();
			const gitignore = config.find((c) => "name" in c && c.name === "@theholocron/gitignore");
			expect(gitignore).toBeDefined();
			expect(gitignore?.ignores).toContain("**/dist/");
		});

		it("stops at a .git directory and doesn't walk past the repo root", () => {
			originalCwd = process.cwd();
			tmpDir = mkdtempSync(join(tmpdir(), "eslint-config-gitignore-boundary-"));
			// A .gitignore OUTSIDE the repo root must never be picked up —
			// only .git marks where the walk is allowed to stop searching.
			writeFileSync(join(tmpDir, ".gitignore"), "should-not-be-found/\n");
			const repoRoot = join(tmpDir, "repo");
			mkdirSync(join(repoRoot, ".git"), { recursive: true });
			const nested = join(repoRoot, "packages", "some-package");
			mkdirSync(nested, { recursive: true });
			process.chdir(nested);

			const config = base();
			expect(config.some((c) => "name" in c && c.name === "@theholocron/gitignore")).toBe(false);
		});
	});

	it("typescript() returns a non-empty flat config array", () => {
		const config = typescript();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("node() returns a non-empty flat config array", () => {
		const config = node();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("react() returns a non-empty flat config array", () => {
		const config = react();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("react() config runs without throwing on ESLint v10 context API", () => {
		const linter = new Linter({ configType: "flat" });
		expect(() => linter.verify("const x = 1;", react() as Parameters<Linter["verify"]>[1])).not.toThrow();
	});
});

describe("eslint-config — package-json config", () => {
	it("packageJson() returns a non-empty flat config array", () => {
		const config = packageJson();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("packageJson() targets package.json files", () => {
		const config = packageJson();
		const files = config.flatMap((c) => ("files" in c ? (c.files as string[]) : []));
		expect(files.some((f) => f.includes("package.json"))).toBe(true);
	});

	it("packageJson() disables dependency-version-range", () => {
		const config = packageJson();
		const rules = config.flatMap((c) => ("rules" in c ? Object.entries(c.rules ?? {}) : []));
		expect(rules.some(([k, v]) => k === "package-json/dependency-version-range" && v === "off")).toBe(true);
	});

	it("packageJson() disables no-wildcard-dependencies", () => {
		const config = packageJson();
		const rules = config.flatMap((c) => ("rules" in c ? Object.entries(c.rules ?? {}) : []));
		expect(rules.some(([k, v]) => k === "package-json/no-wildcard-dependencies" && v === "off")).toBe(true);
	});
});

describe("eslint-config — storybook config", () => {
	it("disables storybook/no-uninstalled-addons (crashes pnpm lint in monorepos — configs#449)", () => {
		const config = storybook();
		const rules = config.flatMap((c) => ("rules" in c ? Object.entries(c.rules ?? {}) : []));
		expect(rules.some(([k, v]) => k === "storybook/no-uninstalled-addons" && v === "off")).toBe(true);
	});
});

describe("eslint-config — bundles", () => {
	it("library() returns a non-empty flat config array", () => {
		const config = library();
		expect(Array.isArray(config)).toBe(true);
		expect(config.length).toBeGreaterThan(0);
	});

	it("library() includes a config named @theholocron/library", () => {
		const config = library();
		expect(config.some((c) => "name" in c && c.name === "@theholocron/library")).toBe(true);
	});

	it("library() config runs without throwing on ESLint v10 context API", () => {
		const linter = new Linter({ configType: "flat" });
		expect(() => linter.verify("const x = 1;\n", library() as Parameters<Linter["verify"]>[1])).not.toThrow();
	});

	it("library({ browserPackages }) config runs without throwing", () => {
		const linter = new Linter({ configType: "flat" });
		const config = library({ browserPackages: ["packages/location-utils/src"] });
		expect(() => linter.verify("const x = 1;\n", config as Parameters<Linter["verify"]>[1])).not.toThrow();
	});

	it("library() bakes in vitest() unconditionally — matches test/setup files", () => {
		const config = library();
		const files = config.flatMap((c) => ("files" in c ? (c.files as string[]) : []));
		expect(files.some((f) => f.includes("{test,spec}"))).toBe(true);
	});

	it("library() with no browserPackages omits the browser-packages config", () => {
		const config = library();
		expect(config.some((c) => "name" in c && c.name === "@theholocron/library/browser-packages")).toBe(false);
	});

	it("library({ browserPackages }) adds a scoped node-builtins exception", () => {
		const config = library({ browserPackages: ["packages/location-utils/src", "packages/misc-utils/src"] });
		const browserPackages = config.find((c) => "name" in c && c.name === "@theholocron/library/browser-packages");
		expect(browserPackages).toBeDefined();
		expect(browserPackages?.files).toEqual(["packages/location-utils/src/**", "packages/misc-utils/src/**"]);
		expect(browserPackages?.rules?.["n/no-unsupported-features/node-builtins"]).toBe("off");
	});

	it("has a ready-to-use default export — required for `eslint --config <path>` to load it directly", () => {
		expect(Array.isArray(libraryDefault)).toBe(true);
		expect(libraryDefault.length).toBeGreaterThan(0);
		expect(libraryDefault.some((c) => "name" in c && c.name === "@theholocron/library")).toBe(true);
	});
});
