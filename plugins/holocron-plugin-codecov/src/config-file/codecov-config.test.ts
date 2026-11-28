import { describe, expect, it } from "vitest";

import { codecovComponentBlock, createCodecovConfig, mergeCodecovComponents } from "./codecov-config.js";
import {
	ensureDocumentationCoverage,
	ensureFlagManagement,
	ensureIfNotFound,
	ensureIgnore,
	ensureInformationalComponentStatuses,
	scopeAggregateStatuses,
} from "./yaml-rules.js";

interface Pkg {
	slug: string;
	name: string;
	dir?: string;
	path?: string;
}

const where = (pkg: Pkg) => pkg.path ?? `${pkg.dir ?? "packages"}/${pkg.slug}`;
const components = (packages: Pkg[]) => packages.map((pkg) => ({ id: pkg.slug, path: where(pkg) }));
/** The CLI's rule (a `docs` folder has no flag), restated for the fixtures. */
const flags = (packages: Pkg[]) => packages.filter((pkg) => where(pkg).split("/")[0] !== "docs").map((pkg) => pkg.slug);
const create = (packages: Pkg[], documentation: "off" | "warn" | "required" = "off") =>
	createCodecovConfig(components(packages), { flags: flags(packages), documentation });
const merge = (existing: string, packages: Pkg[], documentation: "off" | "warn" | "required" = "off") =>
	mergeCodecovComponents(existing, components(packages), { flags: flags(packages), documentation });

const multi = [
	{ slug: "comlink", name: "a", dir: "apps" },
	{ slug: "sentinel", name: "b", dir: "apps" },
	{ slug: "cli", name: "c", dir: "cli" },
	{ slug: "observability", name: "d", path: "observability" },
	{ slug: "docs-theme", name: "e", path: "docs/theme" },
];

describe("codecovComponentBlock", () => {
	it("lists nothing for no components, and one heading per workspace root otherwise", () => {
		expect(codecovComponentBlock([])).toBe("\n    []\n");
		const block = codecovComponentBlock(components(multi));
		expect(block.match(/^ {4}# \S+$/gm)).toEqual(["    # apps", "    # cli", "    # observability", "    # docs"]);
	});
});

describe("createCodecovConfig", () => {
	it("includes standard coverage thresholds and comment layout", () => {
		const out = create([]);
		expect(out).toContain("require_ci_to_pass: true");
		expect(out).toContain("target: auto");
		expect(out).toContain("target: 80%");
		expect(out).toContain('layout: "reach,diff,flags"');
		expect(out).toContain("require_changes: true");
	});

	it("includes the scaffold header", () => {
		expect(create([])).toContain("Scaffolded by holocron setup");
	});

	it("produces individual_components entry for each package using slug as name", () => {
		const out = create([
			{ slug: "http-client", name: "@theholocron/http-client" },
			{ slug: "clerk-client", name: "@theholocron/clerk-client" },
		]);
		expect(out).toContain("component_id: http-client");
		expect(out).toContain('name: "http-client"');
		expect(out).not.toContain("@theholocron/");
		expect(out).toContain("component_id: clerk-client");
	});

	it("produces empty individual_components list when no packages are given", () => {
		const out = create([]);
		expect(out).toContain("individual_components:");
		expect(out).toContain("[]");
	});

	it('uses apps/<slug>/** as the path for a package tagged dir: "apps"', () => {
		const out = create([{ slug: "web", name: "@theholocron/web", dir: "apps" }]);
		expect(out).toContain("component_id: web");
		expect(out).toContain("- apps/web/**");
		expect(out).not.toContain("- packages/web/**");
	});

	it("defaults to packages/<slug>/** when dir is omitted", () => {
		const out = create([{ slug: "ui", name: "@theholocron/ui" }]);
		expect(out).toContain("- packages/ui/**");
	});

	it("ends with a trailing newline", () => {
		expect(create([])).toMatch(/\n$/);
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
		const out = merge(existing, [{ slug: "new-pkg", name: "@acme/new-pkg" }]);
		expect(out).toContain('range: "70...100"');
		expect(out).toContain("threshold: 2%");
		expect(out).toContain("component_id: new-pkg");
		expect(out).not.toContain("old-pkg");
	});

	it("uses slug as the component name, not the npm package name", () => {
		const out = merge(existing, [{ slug: "foo", name: "@acme/foo" }]);
		expect(out).toContain('name: "foo"');
		expect(out).not.toContain("@acme/");
	});

	it("leaves the components alone when the individual_components marker is absent", () => {
		const noMarker = "codecov:\n  require_ci_to_pass: true\n";
		const out = merge(noMarker, [{ slug: "foo", name: "@acme/foo" }]);
		expect(out).toContain("require_ci_to_pass: true");
		expect(out).not.toContain("component_id");
		expect(out).toContain("    - name: foo");
	});

	it("injects if_not_found into a pre-existing codecov.yml that lacks it", () => {
		const out = merge(existing, [{ slug: "new-pkg", name: "@acme/new-pkg" }]);
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

describe("flag_management in a generated file", () => {
	it("emits carryforward defaults and one individual flag per package, with no per-flag statuses", () => {
		const out = create(multi);
		expect(out).toContain(
			"flag_management:\n  default_rules:\n    carryforward: true\n  individual_flags:\n    - name: comlink\n    - name: sentinel\n    - name: cli\n    - name: observability\n\ncomponent_management:"
		);
		expect(out).not.toContain("name: docs");
		expect(out.split("flag_management:")[1]!.split("component_management:")[0]).not.toContain("statuses");
	});

	it("scopes the aggregate project and patch statuses to the flags", () => {
		const out = create(multi);
		const flags =
			"        flags:\n          - comlink\n          - sentinel\n          - cli\n          - observability\n";
		expect(out).toContain(`    project:\n      default:\n${flags}        target: auto`);
		expect(out).toContain(`    patch:\n      default:\n${flags}        target: 80%`);
	});

	it("makes the component statuses informational", () => {
		expect(create(multi)).toMatch(
			/- type: patch\n\s+target: 80%\n\s+if_not_found: success\n\s+informational: true/
		);
	});

	it("emits an empty flag list and no aggregate scoping without packages", () => {
		const out = create([]);
		expect(out).toContain("  individual_flags: []");
		expect(out).not.toContain("        flags:");
	});

	it("is idempotent through a merge", () => {
		const once = create(multi);
		expect(merge(once, multi)).toBe(once);
	});
});

describe("ensureFlagManagement", () => {
	const base = "coverage:\n  precision: 2\n\ncomponent_management:\n  individual_components:";

	it("inserts the section before component_management when absent", () => {
		const out = ensureFlagManagement(base, ["apps"]);
		expect(out).toBe(
			"coverage:\n  precision: 2\n\nflag_management:\n  default_rules:\n    carryforward: true\n  individual_flags:\n    - name: apps\n\ncomponent_management:\n  individual_components:"
		);
	});

	it("appends the section at the end when there is no component_management", () => {
		const out = ensureFlagManagement("coverage:\n  precision: 2", ["apps"]);
		expect(out).toBe(
			"coverage:\n  precision: 2\n\nflag_management:\n  default_rules:\n    carryforward: true\n  individual_flags:\n    - name: apps"
		);
	});

	it("only adds missing flags to an existing section, keeping hand edits", () => {
		const existing = [
			"flag_management:",
			"  default_rules:",
			"    carryforward: false",
			"  individual_flags:",
			"    - name: apps",
			"      paths:",
			"        - apps/",
			"    - name: custom",
			"",
			"component_management:",
		].join("\n");
		const out = ensureFlagManagement(existing, ["apps", "cli"]);
		expect(out).toBe(
			[
				"flag_management:",
				"  default_rules:",
				"    carryforward: false",
				"  individual_flags:",
				"    - name: apps",
				"      paths:",
				"        - apps/",
				"    - name: custom",
				"    - name: cli",
				"",
				"component_management:",
			].join("\n")
		);
		expect(ensureFlagManagement(out, ["apps", "cli"])).toBe(out);
	});

	it("adds individual_flags to a section that lacks it", () => {
		const out = ensureFlagManagement("flag_management:\n  default_rules:\n    carryforward: true\n", ["apps"]);
		expect(out).toBe(
			"flag_management:\n  default_rules:\n    carryforward: true\n  individual_flags:\n    - name: apps\n"
		);
	});

	it("fills an empty individual_flags list", () => {
		const out = ensureFlagManagement("flag_management:\n  individual_flags: []\n", ["apps"]);
		expect(out).toBe("flag_management:\n  individual_flags:\n    - name: apps\n");
	});

	it("leaves an empty list empty when there are no flags", () => {
		const text = "flag_management:\n  individual_flags: []\n";
		expect(ensureFlagManagement(text, [])).toBe(text);
	});
});

describe("scopeAggregateStatuses", () => {
	const yaml = (flagsBlock: string) =>
		`coverage:\n  status:\n    project:\n      default:\n${flagsBlock}        target: auto\n    patch:\n      default:\n        target: 80%\n`;

	it("adds flags to both aggregates", () => {
		const out = scopeAggregateStatuses(yaml(""), ["apps"]);
		expect(out).toBe(
			"coverage:\n  status:\n    project:\n      default:\n        flags:\n          - apps\n        target: auto\n    patch:\n      default:\n        flags:\n          - apps\n        target: 80%\n"
		);
	});

	it("adds only the missing flags to an existing list", () => {
		const out = scopeAggregateStatuses(yaml("        flags:\n          - apps\n          - extra\n"), [
			"apps",
			"cli",
		]);
		expect(out).toContain(
			"        flags:\n          - apps\n          - extra\n          - cli\n        target: auto"
		);
	});

	it("leaves an inline flags list alone", () => {
		const text = yaml("        flags: [apps]\n");
		expect(scopeAggregateStatuses(text, ["apps", "cli"])).toContain("        flags: [apps]\n        target: auto");
	});

	it("does nothing without flags, or without a default block", () => {
		expect(scopeAggregateStatuses(yaml(""), [])).toBe(yaml(""));
		const bare = "coverage:\n  status:\n    patch:\n      target: 80%\n";
		expect(scopeAggregateStatuses(bare, ["apps"])).toBe(bare);
		expect(scopeAggregateStatuses("codecov:\n", ["apps"])).toBe("codecov:\n");
	});
});

describe("ensureInformationalComponentStatuses", () => {
	const text = (extra: string) =>
		`component_management:\n  default_rules:\n    statuses:\n      - type: patch\n        target: 80%\n${extra}  individual_components:\n`;

	it("adds informational: true to each default status, once", () => {
		const out = ensureInformationalComponentStatuses(text(""));
		expect(out).toBe(text("        informational: true\n"));
		expect(ensureInformationalComponentStatuses(out)).toBe(out);
	});

	it("keeps a status that already sets informational", () => {
		const own = text("        informational: false\n");
		expect(ensureInformationalComponentStatuses(own)).toBe(own);
	});

	it("works when there is no individual_components marker, and without the section", () => {
		const noMarker =
			"component_management:\n  default_rules:\n    statuses:\n      - type: patch\n        target: 80%\n";
		expect(ensureInformationalComponentStatuses(noMarker)).toContain("informational: true");
		expect(ensureInformationalComponentStatuses("codecov:\n")).toBe("codecov:\n");
	});
});

describe("ensureIgnore", () => {
	it("inserts the docs globs before coverage, once", () => {
		const out = ensureIgnore("codecov:\n  require_ci_to_pass: true\n\ncoverage:\n  precision: 2\n");
		expect(out).toBe(
			'codecov:\n  require_ci_to_pass: true\n\nignore:\n  - "**/*.mdx"\n\ncoverage:\n  precision: 2\n'
		);
		expect(ensureIgnore(out)).toBe(out);
	});

	it("keeps globs already listed and adds only the missing one", () => {
		const own = 'ignore:\n  - "**/*.snap"\n\ncoverage:\n';
		expect(ensureIgnore(own)).toBe('ignore:\n  - "**/*.snap"\n  - "**/*.mdx"\n\ncoverage:\n');
		const done = "ignore:\n  - **/*.mdx\n\ncoverage:\n";
		expect(ensureIgnore(done)).toBe(done);
	});

	it("appends the list when there is no coverage section", () => {
		expect(ensureIgnore("codecov:\n")).toBe('codecov:\n\nignore:\n  - "**/*.mdx"');
	});

	it("is written into a new codecov.yml and into one that is merged", () => {
		expect(create([])).toContain('ignore:\n  - "**/*.mdx"');
		expect(merge("coverage:\n  precision: 2\n", [])).toContain('ignore:\n  - "**/*.mdx"');
	});
});

describe("mergeCodecovComponents with flags", () => {
	it("adds flag_management, scoping and informational statuses to an existing file without them", () => {
		const old =
			"coverage:\n  status:\n    project:\n      default:\n        target: auto\n    patch:\n      default:\n        target: 80%\n\ncomponent_management:\n  default_rules:\n    statuses:\n      - type: patch\n        target: 80%\n  individual_components:\n    - component_id: gone\n";
		const out = merge(old, multi);
		expect(out).toContain("flag_management:");
		expect(out).toContain("        flags:\n          - comlink");
		expect(out).toContain("informational: true");
		expect(out).not.toContain("gone");
	});

	it("refreshes an existing flag_management with a new package", () => {
		const old = create(multi.slice(0, 2));
		const out = merge(old, multi);
		expect(out).toContain("    - name: cli");
		expect(out.match(/ {4}- name: comlink/g)).toHaveLength(1);
	});
});

describe("ensureIfNotFound with sibling keys", () => {
	it("stops at a sibling key that is not threshold/flags/paths/branches and inserts the key", () => {
		const out = ensureIfNotFound(
			"coverage:\n  status:\n    patch:\n      default:\n        target: 80%\n        base: parent\n"
		);
		expect(out).toContain("        target: 80%\n        if_not_found: success\n        base: parent");
	});
});

describe("ensureDocumentationCoverage", () => {
	const base = create([{ slug: "a", name: "@s/a", dir: "libs" }]);
	const block = (yaml: string, kind: "project" | "patch") =>
		yaml
			.slice(yaml.indexOf(`    ${kind}:`))
			.split("\n")
			.slice(0, 16)
			.join("\n");

	it("adds nothing, and removes nothing, when the mode is off", () => {
		expect(ensureDocumentationCoverage(base, "off")).toBe(base);
		const warned = ensureDocumentationCoverage(base, "warn");
		expect(ensureDocumentationCoverage(warned, "off")).toBe(warned);
	});

	it("adds the documentation flag and a named status under project and patch", () => {
		const out = ensureDocumentationCoverage(base, "required");
		expect(out).toContain("    - name: documentation");
		expect(block(out, "project")).toContain(
			"      documentation:\n        flags:\n          - documentation\n        target: auto\n        if_not_found: success\n"
		);
		expect(block(out, "patch")).toContain(
			"      documentation:\n        flags:\n          - documentation\n        target: 100%\n        if_not_found: success\n"
		);
		expect(out).not.toContain("informational: true\n    patch");
	});

	it("leaves the aggregate project and patch statuses counting only the package flags", () => {
		const out = ensureDocumentationCoverage(base, "required");
		const defaults = out.slice(out.indexOf("      default:"), out.indexOf("      documentation:"));
		expect(defaults).toContain("          - a");
		expect(defaults).not.toContain("documentation");
	});

	it("makes the statuses informational for warn, and not for required", () => {
		const warn = ensureDocumentationCoverage(base, "warn");
		expect(block(warn, "project")).toContain(
			"          - documentation\n        target: auto\n        if_not_found: success\n        informational: true"
		);
		expect(block(warn, "patch")).toContain(
			"        target: 100%\n        if_not_found: success\n        informational: true"
		);
		expect(ensureDocumentationCoverage(base, "required")).not.toContain("informational: true\n      documentation");
	});

	it("is a no-op the second time, and moves between warn and required without duplicating anything", () => {
		const required = ensureDocumentationCoverage(base, "required");
		expect(ensureDocumentationCoverage(required, "required")).toBe(required);
		const warn = ensureDocumentationCoverage(required, "warn");
		expect(warn).toBe(ensureDocumentationCoverage(base, "warn"));
		expect(ensureDocumentationCoverage(warn, "required")).toBe(required);
		expect(required.match(/- name: documentation/g)).toHaveLength(1);
	});

	it("keeps what a hand edit added to an existing documentation status", () => {
		const edited = base.replace(
			"    patch:\n",
			"    patch:\n      documentation:\n        flags:\n          - documentation\n        target: 90%\n        threshold: 1%\n"
		);
		const out = ensureDocumentationCoverage(edited, "warn");
		expect(block(out, "patch")).toContain(
			"        target: 90%\n        threshold: 1%\n        informational: true"
		);
	});

	it("skips a status kind the file does not have", () => {
		const out = ensureDocumentationCoverage(
			"flag_management:\n  individual_flags: []\ncoverage:\n  status:\n    project:\n      default:\n        target: auto",
			"warn"
		);
		expect(out).toContain("    - name: documentation");
		expect(out).toContain("      documentation:\n        flags:");
		expect(out).not.toContain("target: 100%");
	});

	it("is applied by createCodecovConfig, and mergeCodecovComponents from the documentation mode", () => {
		const packages = [{ slug: "a", name: "@s/a", dir: "libs" }];
		const created = create(packages, "required");
		expect(created).toContain("      documentation:");
		expect(create(packages)).not.toContain("documentation");
		expect(merge(base, packages, "required")).toBe(ensureDocumentationCoverage(merge(base, packages), "required"));
		expect(merge("coverage:\n  status: {}", packages, "warn")).toContain("- name: documentation");
	});
});

describe("a new file", () => {
	it("keeps each group folder together under a heading, and writes a component path from `path`", () => {
		const out = create([
			{ slug: "web", name: "@theholocron/web", dir: "apps" },
			{ slug: "a", name: "@theholocron/a", dir: "cli" },
			{ slug: "b", name: "@theholocron/b", dir: "cli" },
			{ slug: "theme", name: "@theholocron/docs-theme", path: "docs/theme" },
		]);
		expect(out.match(/^ {4}# \w+$/gm)).toEqual(["    # apps", "    # cli", "    # docs"]);
		expect(out).toContain("- docs/theme/**");
		expect(out).toContain("component_id: theme");
	});
});
