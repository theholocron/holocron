import { describe, expect, it } from "vitest";

import { turboConfig } from "./turbo.js";

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
