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
});
