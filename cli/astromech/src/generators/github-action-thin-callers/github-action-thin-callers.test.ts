import { describe, expect, it, vi } from "vitest";

import { REUSABLE_WORKFLOWS } from "../github-action-reusable-workflows/index.js";
import {
	deriveDeployPaths,
	extractPreviewConfig,
	generateCombinedDeployContent,
	generateThinCallerContent,
	KNOWN_WORKFLOWS,
	normalizeWorkflowWith,
	withCacheMode,
	WORKFLOW_CHECK_CONTEXTS,
	WORKFLOW_TEMPLATES,
} from "./github-action-thin-callers.js";

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

	it("check contexts point at real workflow names, in '{workflow} / {job}' form", () => {
		for (const [name, context] of Object.entries(WORKFLOW_CHECK_CONTEXTS)) {
			expect(KNOWN_WORKFLOWS.has(name)).toBe(true);
			expect(context).toMatch(/ \/ /);
		}
	});

	it("uses the Conclusion aggregate only for genuinely multi-job tasks", () => {
		// verification.unitTests (5 conditional jobs) and platform.repoValidation
		// (2 jobs that both must pass) need a fan-in; every other task is a
		// single always-run job, so its own conclusion already is the check.
		expect(WORKFLOW_CHECK_CONTEXTS["verification.unitTests"]).toBe("Test / Conclusion");
		expect(WORKFLOW_CHECK_CONTEXTS["platform.repoValidation"]).toBe("Repo Validation / Conclusion");
		expect(WORKFLOW_CHECK_CONTEXTS["sourceQuality.staticAnalysis"]).toBe(
			"Static Analysis / Run eslint and actionlint"
		);
		expect(WORKFLOW_CHECK_CONTEXTS["delivery.bundleSize"]).toBe(
			"Audit the Bundle Size / Upload bundle stats to Codecov"
		);
	});
});

describe("generateThinCallerContent", () => {
	it("returns empty string for unknown workflow name", () => {
		expect(generateThinCallerContent("nonexistent-workflow")).toBe("");
	});

	it("returns base template unchanged when withOverrides is empty / omitted", () => {
		const base = generateThinCallerContent("verification.unitTests", {});
		expect(base).toContain("name: Test");
		expect(base).toContain("secrets: inherit");
		expect(generateThinCallerContent("verification.unitTests")).toBe(base);
	});

	it("injects boolean and string overrides into an existing with: block", () => {
		const content = generateThinCallerContent("verification.unitTests", {
			enable: true,
			debug: false,
			version: "1.2.3",
		});
		expect(content).toContain("with:");
		expect(content).toContain("enable: true");
		expect(content).toContain("debug: false");
		expect(content).toContain("version: 1.2.3");
		expect(content).toContain("secrets: inherit");
	});

	it("single-quotes a JSON string so it stays one string, doubling any apostrophe", () => {
		const uploads = JSON.stringify([
			{ flag: "apps", files: "apps/*/coverage/lcov.info" },
			{ flag: "skills", files: "skills/o'brien/lcov.info" },
		]);
		const content = generateThinCallerContent("verification.unitTests", { uploads });
		const line = content.split("\n").find((l) => l.startsWith("      uploads: "))!;
		const quoted = line.slice("      uploads: ".length);
		expect(quoted.startsWith("'") && quoted.endsWith("'")).toBe(true);
		// undo YAML's single-quote escaping, as the workflow parser does
		expect(quoted.slice(1, -1).replaceAll("''", "'")).toBe(uploads);
	});

	it("injects overrides before secrets: inherit when the template has no with: block", () => {
		const content = generateThinCallerContent("sourceQuality.staticAnalysis", { "yaml-config": "custom.yml" });
		expect(content).toContain("yaml-config: custom.yml");
	});

	it("replaces an existing key when the override matches it", () => {
		const content = generateThinCallerContent("sourceQuality.staticAnalysis", { "enable-auto-commit": false });
		expect(content.match(/enable-auto-commit:/g)).toHaveLength(1);
		expect(content).toContain("enable-auto-commit: false");
	});

	it("single-quotes an override value that looks like a YAML mapping node", () => {
		const content = generateThinCallerContent("sourceQuality.staticAnalysis", { config: '{"key":"val"}' });
		expect(content).toContain(`config: '{"key":"val"}'`);
	});

	it("renders a # comment line above a with: entry when given", () => {
		const content = generateThinCallerContent(
			"sourceQuality.staticAnalysis",
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
		const base = generateThinCallerContent("delivery.deploy");
		expect(generateThinCallerContent("delivery.deploy", undefined, [])).toBe(base);

		const content = generateThinCallerContent("delivery.deploy", undefined, ["src/**", ".storybook/**"]);
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
		const content = generateThinCallerContent("delivery.deploy", { type: "docs", name: "configs" }, ["docs/**"]);
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

	it("joins a chromatic-projects entry's untraced array to a newline-separated string", () => {
		const out = normalizeWorkflowWith({
			"chromatic-projects": [{ tokenName: "WEB", untraced: ["a", "b"] }],
		});
		expect(out["chromatic-projects"]).toBe(JSON.stringify([{ tokenName: "WEB", untraced: "a\nb" }]));
	});

	it("leaves a chromatic-projects entry without untraced untouched", () => {
		const out = normalizeWorkflowWith({ "chromatic-projects": [{ tokenName: "WEB" }] });
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

/**
 * `none` < `read` < `write` -- GitHub's own ordering. A caller
 * granting a *stronger* level than a job requests is valid (sourcery
 * review: an exact-text match would wrongly reject that), so
 * permissions are compared by rank, not by string equality.
 */
const PERMISSION_RANK: Record<string, number> = { none: 0, read: 1, write: 2 };

/**
 * Finds every `permissions:` block in a workflow YAML string --
 * across any number of jobs, not just the first one (sourcery
 * review: a later job's own block would otherwise go unchecked) --
 * and returns the highest rank requested per key. A trailing `#
 * comment` on a real `key: level` line is stripped before matching
 * (sourcery review: a line like `pull-requests: read # why` was
 * silently skipped entirely by a `$`-anchored regex); a line that's
 * only a comment, even one that happens to contain `key: level` text,
 * is excluded by the same strip-then-match pass (sourcery review:
 * raw substring search over the whole block previously let a comment
 * masquerade as a real grant).
 */
function extractPermissionRanks(yaml: string): Map<string, number> {
	const ranks = new Map<string, number>();
	for (const block of yaml.matchAll(/^(?<indent>[ \t]*)permissions:\r?\n((?:\k<indent>[ \t]{2}.*\r?\n?)+)/gm)) {
		for (const line of block[2]!.split(/\r?\n/)) {
			const stripped = line.replace(/#.*$/, "").trim();
			const kv = /^([a-z][a-z-]*):\s*(none|read|write)$/.exec(stripped);
			if (!kv) continue;
			const rank = PERMISSION_RANK[kv[2]!]!;
			if (rank > (ranks.get(kv[1]!) ?? 0)) ranks.set(kv[1]!, rank);
		}
	}
	return ranks;
}

describe("thin caller permissions must be a superset of the reusable workflow's own job permissions", () => {
	it("delivery.previewCheck's thin caller grants at least as much as the reusable workflow requests (holocron#1059 follow-up)", () => {
		// GitHub hard-fails the whole run at startup -- zero jobs
		// dispatched, no annotation anywhere but the run's own error
		// banner -- if a `uses:` job requests more than its caller
		// granted. Confirmed live: delivery.previewCheck's reusable
		// workflow gained a job-level `pull-requests: read` for its
		// author-trust step (holocron#1058) without the thin caller
		// template being updated to match, and a real PR's
		// deployment_status run hit exactly that failure.
		const required = extractPermissionRanks(REUSABLE_WORKFLOWS["delivery.previewCheck"]!);
		const granted = extractPermissionRanks(WORKFLOW_TEMPLATES["delivery.previewCheck"]!);
		expect(required.size).toBeGreaterThan(0);
		for (const [key, requiredRank] of required) {
			expect(granted.get(key) ?? 0, `thin caller's grant for "${key}"`).toBeGreaterThanOrEqual(requiredRank);
		}
	});
});

describe("WORKFLOW_TEMPLATES['platform.notifyCheck']", () => {
	it("is a known workflow", () => {
		expect(KNOWN_WORKFLOWS.has("platform.notifyCheck")).toBe(true);
	});

	it("is dispatch-only (it posts real messages) and calls the reusable check with the caller's secrets", () => {
		const yaml = generateThinCallerContent("platform.notifyCheck");
		expect(yaml).toContain("workflow_dispatch");
		expect(yaml).not.toMatch(/\n {2}(push|pull_request|schedule):/);
		expect(yaml).toContain("uses: theholocron/holocron/.github/workflows/platform.notifyCheck.yml@ci-v1");
		expect(yaml).toContain("secrets: inherit");
		expect(yaml).toContain("permissions: {}");
	});
});

describe("withCacheMode", () => {
	const job = "jobs:\n  a:\n    uses: o/.github/.github/workflows/a.yml@main\n    secrets: inherit\n";
	const capped =
		"jobs:\n  a:\n    uses: o/.github/.github/workflows/a.yml@main\n    cache-mode: read\n    secrets: inherit\n";

	it.each([
		"deployment_status",
		"issues",
		"issue_comment",
		"pull_request_target",
		"workflow_run",
		"discussion",
		"fork",
		"watch",
	])("caps the callee on a %s trigger (block mapping)", (trigger) => {
		expect(withCacheMode(`on: # yamllint disable-line rule:truthy\n  push:\n  ${trigger}:\n\n${job}`)).toContain(
			capped
		);
	});

	it("handles scalar and flow-list `on:` forms", () => {
		expect(withCacheMode(`on: issues\n\n${job}`)).toContain(capped);
		expect(withCacheMode(`on: [push, issue_comment]\n\n${job}`)).toContain(capped);
	});

	it("does not touch callers with only normal triggers", () => {
		for (const on of [
			"on:\n  pull_request:\n  push:\n  workflow_dispatch:\n",
			"on: push\n",
			"on: [push, pull_request]\n",
		]) {
			expect(withCacheMode(`${on}\n${job}`)).not.toContain("cache-mode");
		}
	});

	it("returns workflows without an `on:` block unchanged and never duplicates cache-mode", () => {
		expect(withCacheMode(job)).toBe(job);
		const already = `on:\n  issues:\n\n${capped}`;
		expect(withCacheMode(already)).toBe(already);
	});

	it("caps every reusable call in a multi-job caller", () => {
		const two = `on:\n  issues:\n\n${job}  b:\n    uses: o/.github/.github/workflows/b.yml@main\n`;
		expect(withCacheMode(two).match(/cache-mode: read/g)).toHaveLength(2);
	});

	it("is applied by generateThinCallerContent only for low-trust templates", () => {
		expect(generateThinCallerContent("greetings")).toContain("    cache-mode: read\n");
		expect(generateThinCallerContent("delivery.previewCheck")).toContain("    cache-mode: read\n");
		expect(generateThinCallerContent("verification.typeSafety")).not.toContain("cache-mode");
	});

	it("no shipped template other than the low-trust ones gets a cap", () => {
		const capped = Object.entries(WORKFLOW_TEMPLATES)
			.filter(([n]) => generateThinCallerContent(n).includes("cache-mode"))
			.map(([n]) => n)
			.sort();
		expect(capped).toEqual(["delivery.previewCheck", "greetings"]);
	});
});

describe("WORKFLOW_TEMPLATES['security.tokenExpiry']", () => {
	it("is a known workflow", () => {
		expect(KNOWN_WORKFLOWS.has("security.tokenExpiry")).toBe(true);
	});

	it("runs daily and by hand, read-only, through the reusable workflow", () => {
		const yaml = generateThinCallerContent("security.tokenExpiry");
		expect(yaml).toContain("schedule:");
		expect(yaml).toContain('cron: "17 6 * * *"');
		expect(yaml).toContain("workflow_dispatch: {}");
		expect(yaml).toContain("contents: read");
		expect(yaml).toContain("uses: theholocron/holocron/.github/workflows/security.tokenExpiry.yml@ci-v1");
		expect(yaml).toContain("secrets: inherit");
	});
});
