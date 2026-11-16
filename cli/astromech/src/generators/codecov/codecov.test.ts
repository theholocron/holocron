import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { codecovFlagNames, codecovUploads, packageLocation, readWorkspacePackages } from "./codecov.js";

describe("readWorkspacePackages", () => {
	function makeTempMonorepo(packages: Array<{ name: string; private?: boolean; invalidJson?: boolean }>) {
		const root = mkdtempSync(join(tmpdir(), "astromech-test-"));
		const pkgsDir = join(root, "packages");
		mkdirSync(pkgsDir);
		for (const pkg of packages) {
			const dir = join(pkgsDir, pkg.name.replace(/\//g, "-"));
			mkdirSync(dir);
			const content = pkg.invalidJson ? "not valid json {" : JSON.stringify({ name: pkg.name });
			writeFileSync(join(dir, "package.json"), content);
		}
		// Directory with no package.json — should be skipped.
		mkdirSync(join(pkgsDir, "no-manifest"));
		return root;
	}

	it("skips a package.json that has no name", () => {
		const root = makeTempMonorepo([{ name: "@theholocron/named" }]);
		mkdirSync(join(root, "packages", "anon"));
		writeFileSync(join(root, "packages", "anon", "package.json"), JSON.stringify({ version: "1.0.0" }));
		expect(readWorkspacePackages(root).map((p) => p.slug)).toEqual(["@theholocron-named"]);
	});

	it("discovers packages and skips no-manifest / invalid-JSON entries, sorted by slug", () => {
		const root = makeTempMonorepo([
			{ name: "@theholocron/b-pkg" },
			{ name: "@theholocron/a-pkg" },
			{ name: "@theholocron/broken", invalidJson: true },
		]);
		const packages = readWorkspacePackages(root);
		expect(packages.map((p) => p.slug)).toEqual(["@theholocron-a-pkg", "@theholocron-b-pkg"]);
		expect(packages.every((p) => p.name.startsWith("@theholocron/"))).toBe(true);
	});

	it("returns an empty list when there's no packages/ directory", () => {
		const root = mkdtempSync(join(tmpdir(), "astromech-test-"));
		expect(readWorkspacePackages(root)).toEqual([]);
	});

	it('also discovers apps/* workspaces, tagged with dir: "apps"', () => {
		const root = mkdtempSync(join(tmpdir(), "astromech-test-"));
		mkdirSync(join(root, "packages", "ui"), { recursive: true });
		writeFileSync(join(root, "packages", "ui", "package.json"), JSON.stringify({ name: "@theholocron/ui" }));
		mkdirSync(join(root, "apps", "web"), { recursive: true });
		writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ name: "@theholocron/web" }));

		const packages = readWorkspacePackages(root);
		expect(packages.map((p) => p.slug)).toEqual(["web", "ui"]);
		expect(packages.find((p) => p.slug === "ui")?.dir).toBe("packages");
		expect(packages.find((p) => p.slug === "web")?.dir).toBe("apps");
	});

	it("discovers apps/* even when there's no packages/ directory", () => {
		const root = mkdtempSync(join(tmpdir(), "astromech-test-"));
		mkdirSync(join(root, "apps", "web"), { recursive: true });
		writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ name: "@theholocron/web" }));

		const packages = readWorkspacePackages(root);
		expect(packages).toEqual([{ slug: "web", name: "@theholocron/web", dir: "apps" }]);
	});

	it('also discovers plugins/* workspaces, tagged with dir: "plugins" (holocron\'s own layout — vendor plugins split out of packages/)', () => {
		const root = mkdtempSync(join(tmpdir(), "astromech-test-"));
		mkdirSync(join(root, "packages", "cli"), { recursive: true });
		writeFileSync(join(root, "packages", "cli", "package.json"), JSON.stringify({ name: "@theholocron/cli" }));
		mkdirSync(join(root, "plugins", "holocron-plugin-github"), { recursive: true });
		writeFileSync(
			join(root, "plugins", "holocron-plugin-github", "package.json"),
			JSON.stringify({ name: "@theholocron/holocron-plugin-github" })
		);

		const packages = readWorkspacePackages(root);
		expect(packages.map((p) => p.slug)).toEqual(["cli", "holocron-plugin-github"]);
		expect(packages.find((p) => p.slug === "cli")?.dir).toBe("packages");
		expect(packages.find((p) => p.slug === "holocron-plugin-github")?.dir).toBe("plugins");
	});

	it("discovers plugins/* even when there's no packages/ or apps/ directory", () => {
		const root = mkdtempSync(join(tmpdir(), "astromech-test-"));
		mkdirSync(join(root, "plugins", "holocron-plugin-vercel"), { recursive: true });
		writeFileSync(
			join(root, "plugins", "holocron-plugin-vercel", "package.json"),
			JSON.stringify({ name: "@theholocron/holocron-plugin-vercel" })
		);

		const packages = readWorkspacePackages(root);
		expect(packages).toEqual([
			{ slug: "holocron-plugin-vercel", name: "@theholocron/holocron-plugin-vercel", dir: "plugins" },
		]);
	});
});

describe("readWorkspacePackages with a pnpm-workspace.yaml", () => {
	function makeRepo(workspace: string, packages: Record<string, string>) {
		const root = mkdtempSync(join(tmpdir(), "astromech-test-"));
		writeFileSync(join(root, "pnpm-workspace.yaml"), workspace);
		for (const [dir, name] of Object.entries(packages)) {
			mkdirSync(join(root, dir), { recursive: true });
			writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name }));
		}
		return root;
	}

	it("covers every declared group: `<dir>/<slug>` packages carry their root, a package that is its own folder carries its path", () => {
		const root = makeRepo('packages:\n  - "clients/*"\n  - observability\n  - docs/theme\n', {
			"clients/http-client": "@theholocron/http-client",
			observability: "@theholocron/observability",
			"docs/theme": "@theholocron/docs-theme",
		});
		expect(readWorkspacePackages(root)).toEqual([
			{ slug: "http-client", name: "@theholocron/http-client", dir: "clients" },
			{ slug: "theme", name: "@theholocron/docs-theme", dir: "docs" },
			{ slug: "observability", name: "@theholocron/observability", path: "observability" },
		]);
	});

	it("tells packages with the same folder name apart by their full path", () => {
		const root = makeRepo('packages:\n  - "utils/*"\n  - "clients/*"\n', {
			"utils/env": "@theholocron/env-utils",
			"clients/env": "@theholocron/env-client",
		});
		expect(readWorkspacePackages(root).map((p) => [p.slug, p.path])).toEqual([
			["clients-env", "clients/env"],
			["utils-env", "utils/env"],
		]);
	});

	it("locates a package by its `path` when it is not at <dir>/<slug>, else by <dir>/<slug>", () => {
		expect(packageLocation({ slug: "theme", name: "t", path: "docs/theme" })).toBe("docs/theme");
		expect(packageLocation({ slug: "web", name: "w", dir: "apps" })).toBe("apps/web");
		expect(packageLocation({ slug: "ui", name: "u" })).toBe("packages/ui");
	});
});

const multi = [
	{ slug: "comlink", name: "a", dir: "apps" },
	{ slug: "sentinel", name: "b", dir: "apps" },
	{ slug: "cli", name: "c", dir: "cli" },
	{ slug: "observability", name: "d", path: "observability" },
	{ slug: "docs-theme", name: "e", path: "docs/theme" },
];

describe("codecovFlagNames", () => {
	it("returns one flag per package slug, in order, without docs", () => {
		expect(codecovFlagNames(multi)).toEqual(["comlink", "sentinel", "cli", "observability"]);
	});

	it("returns no flags without packages", () => {
		expect(codecovFlagNames([])).toEqual([]);
	});
});

describe("codecovUploads", () => {
	it("lists one upload per flagged package, reading <location>/coverage/lcov.info", () => {
		expect(JSON.parse(codecovUploads(multi))).toEqual([
			{ flag: "comlink", files: "apps/comlink/coverage/lcov.info" },
			{ flag: "sentinel", files: "apps/sentinel/coverage/lcov.info" },
			{ flag: "cli", files: "cli/cli/coverage/lcov.info" },
			{ flag: "observability", files: "observability/coverage/lcov.info" },
		]);
	});

	it("takes another report path for a package that names one", () => {
		const uploads = JSON.parse(codecovUploads(multi, { observability: "observability/lcov.info" })) as {
			flag: string;
			files: string;
		}[];
		expect(uploads.find((u) => u.flag === "observability")?.files).toBe("observability/lcov.info");
	});

	it("is an empty list without packages", () => {
		expect(codecovUploads([])).toBe("[]");
	});
});
