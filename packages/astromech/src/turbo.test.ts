import { describe, expect, it } from "vitest";

import { ensureRootWorkspaceMember, ensureTurboDependency, turboConfig } from "./turbo.js";

describe("turboConfig", () => {
	it("returns null with no config", () => {
		expect(turboConfig({})).toBeNull();
	});

	it("returns null when no task in the manifest has turbo fan-out config", () => {
		// platform.repoSync / platform.commitStandards have no `turbo` entry in
		// the registry — whole-repo tools, never fanned out.
		expect(turboConfig({ tasks: ["platform.repoSync", "platform.commitStandards"] })).toBeNull();
	});

	it("emits an entry per fan-out-eligible task, keyed by task name", () => {
		const content = turboConfig({
			tasks: ["verification.typeSafety", "verification.unitTests"],
		});
		expect(content).not.toBeNull();
		const parsed = JSON.parse(content!) as { tasks: Record<string, unknown> };
		expect(Object.keys(parsed.tasks)).toEqual(["verification.typeSafety", "verification.unitTests"]);
	});

	it("carries each task's exact inputs/outputs/dependsOn from the registry", () => {
		const content = turboConfig({ tasks: ["delivery.build"] });
		const parsed = JSON.parse(content!) as {
			tasks: Record<string, { inputs: string[]; outputs: string[]; dependsOn: string[] }>;
		};
		expect(parsed.tasks["delivery.build"]).toEqual({
			inputs: [
				"src/**",
				"package.json",
				"tsdown.config.ts",
				"vite.config.ts",
				"rollup.config.ts",
				"tsconfig.json",
			],
			outputs: ["dist/**"],
			dependsOn: ["^delivery.build"],
		});
	});

	it("includes the always-on globalDependencies + $schema", () => {
		const content = turboConfig({ tasks: ["verification.typeSafety"] });
		const parsed = JSON.parse(content!) as { $schema: string; globalDependencies: string[] };
		expect(parsed.$schema).toBe("https://turborepo.org/schema.json");
		expect(parsed.globalDependencies).toEqual(["pnpm-workspace.yaml", "tsconfig.json"]);
	});

	it("skips a task marked local: false", () => {
		expect(turboConfig({ tasks: [{ name: "verification.typeSafety", local: false }] })).toBeNull();
	});

	it("mixes fan-out and non-fan-out tasks — only the eligible ones appear", () => {
		const content = turboConfig({
			tasks: ["sourceQuality.staticAnalysis", "sourceQuality.formatting", "platform.repoSync"],
		});
		const parsed = JSON.parse(content!) as { tasks: Record<string, unknown> };
		expect(Object.keys(parsed.tasks)).toEqual(["sourceQuality.staticAnalysis"]);
	});

	it("accepts bare string tasks the same as object entries", () => {
		const bare = turboConfig({ tasks: ["verification.typeSafety"] });
		const object = turboConfig({ tasks: [{ name: "verification.typeSafety" }] });
		expect(bare).toEqual(object);
	});

	it("ends with a trailing newline (matches prettier's file-ending convention)", () => {
		const content = turboConfig({ tasks: ["verification.typeSafety" as const] });
		expect(content?.endsWith("}\n")).toBe(true);
	});

	it("appends a per-repo turbo.passThroughEnv override to the registry default", () => {
		const content = turboConfig({
			tasks: [{ name: "delivery.build", turbo: { passThroughEnv: ["SENTRY_AUTH_TOKEN"] } }],
		});
		const parsed = JSON.parse(content!) as { tasks: Record<string, { passThroughEnv?: string[] }> };
		expect(parsed.tasks["delivery.build"]?.passThroughEnv).toEqual(["SENTRY_AUTH_TOKEN"]);
	});

	it("omits passThroughEnv entirely when no override is given", () => {
		const content = turboConfig({ tasks: ["delivery.build"] });
		const parsed = JSON.parse(content!) as { tasks: Record<string, { passThroughEnv?: string[] }> };
		expect(parsed.tasks["delivery.build"]?.passThroughEnv).toBeUndefined();
	});

	it("ignores an empty passThroughEnv override the same as no override", () => {
		const content = turboConfig({ tasks: [{ name: "delivery.build", turbo: { passThroughEnv: [] } }] });
		const parsed = JSON.parse(content!) as { tasks: Record<string, { passThroughEnv?: string[] }> };
		expect(parsed.tasks["delivery.build"]?.passThroughEnv).toBeUndefined();
	});

	it("leaves inputs/outputs/dependsOn untouched when only passThroughEnv is overridden", () => {
		const content = turboConfig({
			tasks: [{ name: "delivery.build", turbo: { passThroughEnv: ["FOO"] } }],
		});
		const withOverride = JSON.parse(content!) as {
			tasks: Record<string, { inputs: string[]; outputs: string[]; dependsOn: string[] }>;
		};
		const withoutOverride = JSON.parse(turboConfig({ tasks: ["delivery.build"] })!) as typeof withOverride;
		expect(withOverride.tasks["delivery.build"]?.inputs).toEqual(withoutOverride.tasks["delivery.build"]?.inputs);
		expect(withOverride.tasks["delivery.build"]?.outputs).toEqual(withoutOverride.tasks["delivery.build"]?.outputs);
		expect(withOverride.tasks["delivery.build"]?.dependsOn).toEqual(
			withoutOverride.tasks["delivery.build"]?.dependsOn
		);
	});

	it("a passThroughEnv override on a task with no turbo entry stays a no-op", () => {
		// platform.repoSync has no TurboTaskConfig — the override channel is
		// there to add onto an eligible task's config, not to make an
		// ineligible task suddenly fan out.
		expect(turboConfig({ tasks: [{ name: "platform.repoSync", turbo: { passThroughEnv: ["FOO"] } }] })).toBeNull();
	});
});

// theholocron/observability's real pnpm-workspace.yaml (#692's actual repro)
// — root is the real library, `packages:` lists only the unrelated `docs`
// site. Used verbatim (not reconstructed) so the fix is proven against the
// exact shape that broke, not an idealized version of it. Built line-by-line
// (not a multi-line template literal) so the embedded YAML's own 2-space
// indentation doesn't read as this *source file's* indentation to
// editorconfig-checker (tab-indented, like the rest of the repo).
const OBSERVABILITY_WORKSPACE_YAML = [
	"packages:",
	'  - "docs"',
	"",
	"# Shared dep versions for this repo.",
	"catalog:",
	'  "@astrojs/react": ^6.0.0',
	"  react: ^19.2.0",
	"",
	"catalogs:",
	"  configs:",
	'    "@theholocron/eslint-config": ^8.2.0',
	"",
	"overrides:",
	'  "@eslint/json": ^1.2.0',
	"",
].join("\n");

describe("ensureRootWorkspaceMember", () => {
	it("is a no-op when root has no script matching a turbo-eligible task", () => {
		// holocron's own root shape: "build": "turbo run delivery.build" is an
		// orchestrator, not a "delivery.build" script itself.
		const yaml = "packages:\n  - docs\n  - packages/*\n";
		const result = ensureRootWorkspaceMember(yaml, ["build", "lint", "test"], ["delivery.build"]);
		expect(result).toEqual({ content: yaml, changed: false });
	});

	it("adds a quoted . entry when root has an eligible task and isn't already listed", () => {
		const yaml = 'packages:\n  - "docs"\n';
		const result = ensureRootWorkspaceMember(yaml, ["delivery.build"], ["delivery.build"]);
		expect(result.changed).toBe(true);
		expect(result.content).toBe('packages:\n  - "."\n  - "docs"\n');
	});

	it("fixes #692's exact real repro — observability's actual pnpm-workspace.yaml", () => {
		const result = ensureRootWorkspaceMember(
			OBSERVABILITY_WORKSPACE_YAML,
			["delivery.build", "verification.unitTests"],
			["delivery.build", "verification.unitTests", "verification.typeSafety"]
		);
		expect(result.changed).toBe(true);
		expect(result.content).toContain('packages:\n  - "."\n  - "docs"');
		// Everything after packages: — catalog, catalogs, overrides — survives
		// completely untouched, not reformatted or reordered.
		expect(result.content).toContain('catalog:\n  "@astrojs/react": ^6.0.0\n  react: ^19.2.0');
		expect(result.content).toContain("catalogs:\n  configs:");
		expect(result.content).toContain('overrides:\n  "@eslint/json": ^1.2.0');
	});

	it("is idempotent — running it twice doesn't double-insert", () => {
		const once = ensureRootWorkspaceMember(OBSERVABILITY_WORKSPACE_YAML, ["delivery.build"], ["delivery.build"]);
		const twice = ensureRootWorkspaceMember(once.content, ["delivery.build"], ["delivery.build"]);
		expect(twice.changed).toBe(false);
		expect(twice.content).toBe(once.content);
	});

	it("is a no-op when root is already listed as .", () => {
		const yaml = 'packages:\n  - "."\n  - "docs"\n';
		const result = ensureRootWorkspaceMember(yaml, ["delivery.build"], ["delivery.build"]);
		expect(result).toEqual({ content: yaml, changed: false });
	});

	it("is a no-op when root is already listed as a bare (unquoted) .", () => {
		const yaml = "packages:\n  - .\n  - docs\n";
		const result = ensureRootWorkspaceMember(yaml, ["delivery.build"], ["delivery.build"]);
		expect(result).toEqual({ content: yaml, changed: false });
	});

	it("is a no-op when there's no packages: key at all — already single-package mode", () => {
		const yaml = "# no workspace packages configured\n";
		const result = ensureRootWorkspaceMember(yaml, ["delivery.build"], ["delivery.build"]);
		expect(result).toEqual({ content: yaml, changed: false });
	});

	it("handles an empty packages: list", () => {
		const yaml = "packages:\n\ncatalog:\n  foo: ^1.0.0\n";
		const result = ensureRootWorkspaceMember(yaml, ["delivery.build"], ["delivery.build"]);
		expect(result.changed).toBe(true);
		expect(result.content).toBe('packages:\n  - "."\n\ncatalog:\n  foo: ^1.0.0\n');
	});

	it("matches against every task name being turbo'd, not just the first", () => {
		const yaml = "packages:\n  - docs\n";
		const result = ensureRootWorkspaceMember(
			yaml,
			["verification.unitTests"],
			["delivery.build", "verification.unitTests"]
		);
		expect(result.changed).toBe(true);
	});
});

describe("ensureTurboDependency", () => {
	const pkgWithout = (extra: Record<string, unknown> = {}) =>
		JSON.stringify({ name: "demo", version: "1.0.0", ...extra });

	it("adds turbo pinned to the fallback version when there's no catalog entry", () => {
		const result = ensureTurboDependency(pkgWithout(), "packages:\n  - docs\n");
		expect(result.changed).toBe(true);
		const parsed = JSON.parse(result.content) as { devDependencies: Record<string, string> };
		expect(parsed.devDependencies.turbo).toBe("^2.10.12");
	});

	it("prefers catalog: when the repo's own pnpm-workspace.yaml already has a turbo entry", () => {
		const yaml = OBSERVABILITY_WORKSPACE_YAML.replace("catalog:", "catalog:\n  turbo: ^2.10.9");
		const result = ensureTurboDependency(pkgWithout(), yaml);
		expect(result.changed).toBe(true);
		const parsed = JSON.parse(result.content) as { devDependencies: Record<string, string> };
		expect(parsed.devDependencies.turbo).toBe("catalog:");
	});

	it("is a no-op when devDependencies.turbo already exists — never overrides a repo's own pin", () => {
		const pkg = pkgWithout({ devDependencies: { turbo: "^1.0.0" } });
		const result = ensureTurboDependency(pkg, "packages:\n  - docs\n");
		expect(result).toEqual({ content: pkg, changed: false });
	});

	it("preserves existing devDependencies entries, only adding turbo", () => {
		const pkg = pkgWithout({ devDependencies: { typescript: "^5.0.0" } });
		const result = ensureTurboDependency(pkg, "packages:\n  - docs\n");
		const parsed = JSON.parse(result.content) as { devDependencies: Record<string, string> };
		expect(parsed.devDependencies).toEqual({ typescript: "^5.0.0", turbo: "^2.10.12" });
	});

	it("is idempotent — running it twice doesn't re-touch an already-set entry", () => {
		const once = ensureTurboDependency(pkgWithout(), "packages:\n  - docs\n");
		const twice = ensureTurboDependency(once.content, "packages:\n  - docs\n");
		expect(twice.changed).toBe(false);
		expect(twice.content).toBe(once.content);
	});

	it("fixes #692's exact real repro — observability had no turbo devDependency at all", () => {
		const result = ensureTurboDependency(
			pkgWithout({ name: "@theholocron/observability" }),
			OBSERVABILITY_WORKSPACE_YAML
		);
		expect(result.changed).toBe(true);
		const parsed = JSON.parse(result.content) as { devDependencies: Record<string, string> };
		// observability's real pnpm-workspace.yaml (above) has no turbo catalog
		// entry — falls back to the pinned version, not "catalog:".
		expect(parsed.devDependencies.turbo).toBe("^2.10.12");
	});
});
