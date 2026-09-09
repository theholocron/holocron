import { describe, expect, it, vi } from "vitest";

import {
	deriveDeployPaths,
	extractPreviewConfig,
	generateCombinedDeployContent,
	generateThinCallerContent,
	KNOWN_WORKFLOWS,
	normalizeWorkflowWith,
	WORKFLOW_CHECK_CONTEXTS,
	WORKFLOW_TEMPLATES,
} from "./thin-callers.js";

describe("WORKFLOW_TEMPLATES", () => {
	it("KNOWN_WORKFLOWS mirrors the template keys", () => {
		expect([...KNOWN_WORKFLOWS].sort()).toEqual(Object.keys(WORKFLOW_TEMPLATES).sort());
	});

	it("every template is a non-empty YAML string with a name: header", () => {
		for (const yaml of Object.values(WORKFLOW_TEMPLATES)) {
			expect(yaml).toMatch(/^name: /);
			expect(yaml.length).toBeGreaterThan(20);
		}
	});

	it("check contexts point at real workflow names and use the Conclusion aggregate job", () => {
		for (const [name, context] of Object.entries(WORKFLOW_CHECK_CONTEXTS)) {
			expect(KNOWN_WORKFLOWS.has(name)).toBe(true);
			expect(context).toMatch(/ \/ Conclusion$/);
		}
		expect(WORKFLOW_CHECK_CONTEXTS["lint"]).toBe("Lint / Conclusion");
		expect(WORKFLOW_CHECK_CONTEXTS["audit"]).toBe("audit / Conclusion");
	});
});

describe("generateThinCallerContent", () => {
	it("returns empty string for unknown workflow name", () => {
		expect(generateThinCallerContent("nonexistent-workflow")).toBe("");
	});

	it("returns base template unchanged when withOverrides is empty / omitted", () => {
		const base = generateThinCallerContent("test", {});
		expect(base).toContain("name: Test");
		expect(base).toContain("secrets: inherit");
		expect(generateThinCallerContent("test")).toBe(base);
	});

	it("injects boolean and string overrides into an existing with: block", () => {
		const content = generateThinCallerContent("test", { enable: true, debug: false, version: "1.2.3" });
		expect(content).toContain("with:");
		expect(content).toContain("enable: true");
		expect(content).toContain("debug: false");
		expect(content).toContain("version: 1.2.3");
		expect(content).toContain("secrets: inherit");
	});

	it("injects overrides before secrets: inherit when the template has no with: block", () => {
		const content = generateThinCallerContent("lint", { "yaml-config": "custom.yml" });
		expect(content).toContain("yaml-config: custom.yml");
	});

	it("replaces an existing key when the override matches it", () => {
		const content = generateThinCallerContent("lint", { "enable-auto-commit": false });
		expect(content.match(/enable-auto-commit:/g)).toHaveLength(1);
		expect(content).toContain("enable-auto-commit: false");
	});

	it("single-quotes an override value that looks like a YAML mapping node", () => {
		const content = generateThinCallerContent("lint", { config: '{"key":"val"}' });
		expect(content).toContain(`config: '{"key":"val"}'`);
	});

	it("renders a # comment line above a with: entry when given", () => {
		const content = generateThinCallerContent(
			"lint",
			{ "super-linter-env": '{"VALIDATE_YAML":"true"}' },
			undefined,
			undefined,
			{ "super-linter-env": "linters: yamllint" }
		);
		expect(content).toContain("      # linters: yamllint\n      super-linter-env:");
	});

	it("skips a malformed line when merging into an existing with: block", () => {
		const sentinel = "__test_with_malformed__";
		WORKFLOW_TEMPLATES[sentinel] =
			"name: T\n\non:\n  push:\n\njobs:\n  t:\n    uses: a/b@v1\n    with:\n      valid: 1\n      bare-line-no-colon\n    secrets: inherit\n";
		try {
			const content = generateThinCallerContent(sentinel, { added: "x" });
			expect(content).toContain("valid: 1");
			expect(content).toContain("added: x");
			expect(content).not.toContain("bare-line-no-colon");
		} finally {
			delete WORKFLOW_TEMPLATES[sentinel];
		}
	});

	it("warns via the logger and returns base unchanged when no injection pattern matches", () => {
		const sentinel = "__test_no_pattern__";
		WORKFLOW_TEMPLATES[sentinel] = "name: Test\n\njobs:\n  test:\n    uses: some/action@v1\n";
		const warn = vi.fn();
		try {
			const result = generateThinCallerContent(sentinel, { key: "val" }, undefined, { warn });
			expect(warn).toHaveBeenCalledWith(
				expect.objectContaining({ template: sentinel }),
				expect.stringContaining("could not inject")
			);
			expect(result).toBe(WORKFLOW_TEMPLATES[sentinel]);
		} finally {
			delete WORKFLOW_TEMPLATES[sentinel];
		}
	});

	it("does not throw when no injection pattern matches and no logger is given", () => {
		const sentinel = "__test_no_pattern_no_logger__";
		WORKFLOW_TEMPLATES[sentinel] = "name: Test\n\njobs:\n  test:\n    uses: some/action@v1\n";
		try {
			expect(() => generateThinCallerContent(sentinel, { key: "val" })).not.toThrow();
		} finally {
			delete WORKFLOW_TEMPLATES[sentinel];
		}
	});

	it("inserts a paths block when the template has none, in order, deduped when empty", () => {
		const base = generateThinCallerContent("deploy");
		expect(generateThinCallerContent("deploy", undefined, [])).toBe(base);

		const content = generateThinCallerContent("deploy", undefined, ["src/**", ".storybook/**"]);
		expect(content).toContain("    paths:");
		expect(content.indexOf("- src/**")).toBeLessThan(content.indexOf("- .storybook/**"));
	});

	it("appends / deduplicates additionalPaths against an existing paths block", () => {
		const sentinel = "__test_with_paths__";
		WORKFLOW_TEMPLATES[sentinel] =
			"name: Test\n\non:\n  push:\n    branches: [main]\n    paths:\n      - docs/**\n  workflow_dispatch:\n\njobs:\n  test:\n    uses: some/action@v1\n    secrets: inherit\n";
		try {
			const appended = generateThinCallerContent(sentinel, undefined, ["extra/**"]);
			expect(appended).toContain("- docs/**");
			expect(appended).toContain("- extra/**");
			const deduped = generateThinCallerContent(sentinel, undefined, ["docs/**"]);
			expect([...deduped.matchAll(/- docs\/\*\*/g)]).toHaveLength(1);
		} finally {
			delete WORKFLOW_TEMPLATES[sentinel];
		}
	});

	it("applies both additionalPaths and withOverrides together", () => {
		const content = generateThinCallerContent("deploy", { type: "docs", name: "configs" }, ["docs/**"]);
		expect(content).toContain("- docs/**");
		expect(content).toContain("type: docs");
		expect(content).toContain("name: configs");
	});
});

describe("normalizeWorkflowWith", () => {
	it("strips preview", () => {
		expect(normalizeWorkflowWith({ preview: true, "run-unit": true })).toEqual({ "run-unit": true });
	});

	it("expands docs: true → type: docs", () => {
		expect(normalizeWorkflowWith({ docs: true })).toEqual({ type: "docs" });
	});

	it("expands a storybook array → type + storybook-projects JSON", () => {
		const out = normalizeWorkflowWith({ storybook: [{ name: "web", path: "apps/web" }, { name: "ui" }] });
		expect(out["type"]).toBe("storybook");
		expect(out["storybook-projects"]).toBe(
			JSON.stringify([
				{ name: "web", workingDir: "apps/web" },
				{ name: "ui", workingDir: "." },
			])
		);
	});

	it("expands a run-chromatic object → run-chromatic: true + chromatic-projects", () => {
		const out = normalizeWorkflowWith({
			"run-chromatic": { projects: [{ tokenName: "WEB", untraced: ["a", "b"] }] },
		});
		expect(out["run-chromatic"]).toBe(true);
		expect(out["chromatic-projects"]).toBe(JSON.stringify([{ tokenName: "WEB", untraced: "a\nb" }]));
	});

	it("leaves a run-chromatic project without untraced untouched", () => {
		const out = normalizeWorkflowWith({ "run-chromatic": { projects: [{ tokenName: "WEB" }] } });
		expect(out["chromatic-projects"]).toBe(JSON.stringify([{ tokenName: "WEB" }]));
	});

	it("keeps type: docs when both docs and a storybook array are given", () => {
		const out = normalizeWorkflowWith({ docs: true, storybook: [{ name: "ui" }] });
		expect(out["type"]).toBe("docs");
		expect(out["storybook-projects"]).toBe(JSON.stringify([{ name: "ui", workingDir: "." }]));
	});

	it("JSON-stringifies plain array values", () => {
		expect(normalizeWorkflowWith({ paths: ["a", "b"] })).toEqual({ paths: '["a","b"]' });
	});
});

describe("deriveDeployPaths", () => {
	it("returns the org docs paths for docs: true", () => {
		expect(deriveDeployPaths({ docs: true })).toEqual([
			"docs/**",
			"astro.config.ts",
			"pnpm-workspace.yaml",
			"pnpm-lock.yaml",
		]);
	});

	it("returns a scoped glob for docs: { path }", () => {
		expect(deriveDeployPaths({ docs: { path: "site" } })).toEqual(["site/**"]);
		expect(deriveDeployPaths({ docs: { path: "." } })).toEqual([]);
	});

	it("returns src + .storybook for a root storybook project, scoped globs otherwise", () => {
		expect(deriveDeployPaths({ storybook: [{ path: "." }, { path: "apps/ui" }] })).toEqual([
			"src/**",
			".storybook/**",
			"apps/ui/**",
		]);
	});

	it("treats a storybook project with no path as root", () => {
		expect(deriveDeployPaths({ storybook: [{ name: "ui" }] })).toEqual(["src/**", ".storybook/**"]);
	});

	it("returns [] with no docs/storybook shorthand", () => {
		expect(deriveDeployPaths({ "run-build": true })).toEqual([]);
	});
});

describe("extractPreviewConfig", () => {
	it("returns null when preview is absent or a bare primitive", () => {
		expect(extractPreviewConfig({})).toBeNull();
		expect(extractPreviewConfig({ preview: 42 })).toBeNull();
		expect(extractPreviewConfig({ preview: "invalid" })).toBeNull();
		expect(extractPreviewConfig({ preview: true }, {})).toBeNull();
		expect(extractPreviewConfig({ preview: {} }, {})).toBeNull();
	});

	it("derives project (+ domain) from org context for preview: true", () => {
		expect(extractPreviewConfig({ preview: true }, { org: "acme", domain: "acme.dev" })).toEqual({
			project: "acme-preview",
			domain: "preview.acme.dev",
		});
		expect(extractPreviewConfig({ preview: true }, { org: "acme" })).toEqual({ project: "acme-preview" });
	});

	it("honours an explicit project / domain in the object form", () => {
		expect(
			extractPreviewConfig({ preview: { project: "my-preview" } }, { org: "acme", domain: "acme.dev" })
		).toEqual({ project: "my-preview", domain: "preview.acme.dev" });
		expect(
			extractPreviewConfig(
				{ preview: { project: "my-preview", domain: "custom.preview.dev" } },
				{ org: "acme", domain: "acme.dev" }
			)
		).toEqual({ project: "my-preview", domain: "custom.preview.dev" });
		expect(extractPreviewConfig({ preview: {} }, { org: "acme" })).toEqual({ project: "acme-preview" });
	});
});

describe("generateCombinedDeployContent", () => {
	it("emits both push and pull_request triggers", () => {
		const content = generateCombinedDeployContent({}, [], { project: "my-preview" });
		expect(content).toContain("push:");
		expect(content).toContain("pull_request:");
	});

	it("includes the paths block in both triggers when paths are provided", () => {
		const content = generateCombinedDeployContent({}, ["docs/**", "astro.config.ts"], { project: "my-preview" });
		expect([...content.matchAll(/paths:/g)].length).toBeGreaterThanOrEqual(2);
		expect(content).toContain("- docs/**");
	});

	it("forwards cloudflare-project into the preview job even when deployWith is empty", () => {
		const content = generateCombinedDeployContent({}, [], { project: "acme-preview" });
		expect(content).toContain("cloudflare-project: acme-preview");
		const previewSection = content.slice(content.indexOf("name: Preview"));
		expect(previewSection).toContain("cloudflare-project: acme-preview");
	});

	it("emits the deploy with: block when deployWith is non-empty and serialises scalars", () => {
		const content = generateCombinedDeployContent(
			{ type: "docs", name: "acme", "run-unit": true, "run-storybook": false, "storybook-projects": '["a","b"]' },
			[],
			{ project: "p" }
		);
		expect(content).toContain("type: docs");
		expect(content).toContain("run-unit: true");
		expect(content).toContain("run-storybook: false");
		expect(content).toContain('storybook-projects: \'["a","b"]\'');
	});
});
