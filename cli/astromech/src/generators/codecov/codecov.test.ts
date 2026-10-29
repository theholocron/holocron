import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
	codecovConfig,
	createCodecovConfig,
	ensureIfNotFound,
	mergeCodecovComponents,
	readWorkspacePackages,
} from "./codecov.js";

describe("createCodecovConfig", () => {
	it("includes standard coverage thresholds and comment layout", () => {
		const out = createCodecovConfig([]);
		expect(out).toContain("require_ci_to_pass: true");
		expect(out).toContain("target: auto");
		expect(out).toContain("target: 80%");
		expect(out).toContain('layout: "reach,diff,flags,components"');
		expect(out).toContain("require_changes: true");
	});

	it("includes the scaffold header", () => {
		expect(createCodecovConfig([])).toContain("Scaffolded by holocron repo setup");
	});

	it("produces individual_components entry for each package using slug as name", () => {
		const out = createCodecovConfig([
			{ slug: "http-client", name: "@theholocron/http-client" },
			{ slug: "clerk-client", name: "@theholocron/clerk-client" },
		]);
		expect(out).toContain("component_id: http-client");
		expect(out).toContain('name: "http-client"');
		expect(out).not.toContain("@theholocron/");
		expect(out).toContain("component_id: clerk-client");
	});

	it("produces empty individual_components list when no packages are given", () => {
		const out = createCodecovConfig([]);
		expect(out).toContain("individual_components:");
		expect(out).toContain("[]");
	});

	it('uses apps/<slug>/** as the path for a package tagged dir: "apps"', () => {
		const out = createCodecovConfig([{ slug: "web", name: "@theholocron/web", dir: "apps" }]);
		expect(out).toContain("component_id: web");
		expect(out).toContain("- apps/web/**");
		expect(out).not.toContain("- packages/web/**");
	});

	it("defaults to packages/<slug>/** when dir is omitted", () => {
		const out = createCodecovConfig([{ slug: "ui", name: "@theholocron/ui" }]);
		expect(out).toContain("- packages/ui/**");
	});

	it("ends with a trailing newline", () => {
		expect(createCodecovConfig([])).toMatch(/\n$/);
	});
});

describe("mergeCodecovComponents", () => {
	const existing = [
		"codecov:",
		"  require_ci_to_pass: true",
		"",
		"coverage:",
		'  range: "70...100"',
		"  status:",
		"    patch:",
		"      default:",
		"        threshold: 2%",
		"",
		"component_management:",
		"  default_rules:",
		"    statuses:",
		"      - type: patch",
		"        target: 80%",
		"  individual_components:",
		"    - component_id: old-pkg",
		'      name: "old-pkg"',
		"      paths:",
		"        - packages/old-pkg/**",
		"",
	].join("\n");

	it("replaces individual_components block while preserving the rest of the file", () => {
		const out = mergeCodecovComponents(existing, [{ slug: "new-pkg", name: "@acme/new-pkg" }]);
		expect(out).toContain('range: "70...100"');
		expect(out).toContain("threshold: 2%");
		expect(out).toContain("component_id: new-pkg");
		expect(out).not.toContain("old-pkg");
	});

	it("uses slug as the component name, not the npm package name", () => {
		const out = mergeCodecovComponents(existing, [{ slug: "foo", name: "@acme/foo" }]);
		expect(out).toContain('name: "foo"');
		expect(out).not.toContain("@acme/");
	});

	it("returns the file unchanged when individual_components marker is absent", () => {
		const noMarker = "codecov:\n  require_ci_to_pass: true\n";
		expect(mergeCodecovComponents(noMarker, [{ slug: "foo", name: "@acme/foo" }])).toBe(noMarker);
	});

	it("injects if_not_found into a pre-existing codecov.yml that lacks it", () => {
		const out = mergeCodecovComponents(existing, [{ slug: "new-pkg", name: "@acme/new-pkg" }]);
		// the component_management default status in the preserved prefix gains the key
		expect(out).toMatch(/- type: patch\n\s+target: 80%\n\s+if_not_found: success/);
	});
});

describe("ensureIfNotFound", () => {
	it("adds if_not_found: success after every status target", () => {
		const input = [
			"coverage:",
			"  status:",
			"    project:",
			"      default:",
			"        target: auto",
			"        threshold: 2%",
			"    patch:",
			"      default:",
			"        target: 80%",
			"",
		].join("\n");
		const out = ensureIfNotFound(input);
		expect(out).toMatch(/target: auto\n\s+if_not_found: success\n\s+threshold: 2%/);
		expect(out).toMatch(/target: 80%\n\s+if_not_found: success/);
	});

	it("is idempotent — does not double-insert when the key is already present", () => {
		const input = [
			"    project:",
			"      default:",
			"        target: auto",
			"        if_not_found: success",
			"",
		].join("\n");
		expect(ensureIfNotFound(input)).toBe(input);
	});

	it("leaves shallow (non-status) target keys untouched", () => {
		const input = ["thresholds:", "  target: 90", ""].join("\n");
		expect(ensureIfNotFound(input)).toBe(input);
	});

	it("handles a statuses list item (component_management default rule)", () => {
		const input = [
			"component_management:",
			"  default_rules:",
			"    statuses:",
			"      - type: patch",
			"        target: 80%",
			"",
		].join("\n");
		expect(ensureIfNotFound(input)).toMatch(/target: 80%\n\s+if_not_found: success/);
	});
});

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

describe("codecovConfig", () => {
	it("scaffolds a new file when existing is null", () => {
		const root = mkdtempSync(join(tmpdir(), "astromech-test-"));
		const out = codecovConfig(root, null);
		expect(out).toContain("Scaffolded by holocron repo setup");
		expect(out).toContain("individual_components:");
	});

	it("merges into an existing file's component list", () => {
		const root = mkdtempSync(join(tmpdir(), "astromech-test-"));
		mkdirSync(join(root, "packages", "foo"), { recursive: true });
		writeFileSync(join(root, "packages", "foo", "package.json"), JSON.stringify({ name: "@theholocron/foo" }));
		const existing = "codecov:\n  require_ci_to_pass: true\n\ncomponent_management:\n  individual_components:\n";
		const out = codecovConfig(root, existing);
		expect(out).toContain("require_ci_to_pass: true");
		expect(out).toContain("component_id: foo");
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

	it("keeps each group folder together under a heading", () => {
		const out = createCodecovConfig([
			{ slug: "web", name: "@theholocron/web", dir: "apps" },
			{ slug: "a", name: "@theholocron/a", dir: "cli" },
			{ slug: "b", name: "@theholocron/b", dir: "cli" },
			{ slug: "theme", name: "@theholocron/docs-theme", path: "docs/theme" },
		]);
		expect(out.match(/^ {4}# \w+$/gm)).toEqual(["    # apps", "    # cli", "    # docs"]);
	});

	it("writes a component path from `path` when the package is not at <dir>/<slug>", () => {
		const out = createCodecovConfig([{ slug: "theme", name: "@theholocron/docs-theme", path: "docs/theme" }]);
		expect(out).toContain("- docs/theme/**");
		expect(out).toContain("component_id: theme");
	});
});
