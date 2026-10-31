import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { generateConfigFiles } from "./generate-config-files.js";
import { generateRepoFiles } from "./generate-repo-files.js";
import { generateTurboFiles } from "./generate-turbo-files.js";
import { generateWorkflowFiles } from "./generate-workflow-files.js";
import { hooksEnabled } from "./hooks-enabled.js";

// `codecovConfig` is tolerant of a bad file on disk, so a failure in it is made on demand.
const codecov = vi.hoisted(() => ({ fail: false }));
vi.mock("@theholocron/astromech", async (importOriginal) => {
	const real = await importOriginal<typeof import("@theholocron/astromech")>();
	return {
		...real,
		createAstromech: (...args: Parameters<typeof real.createAstromech>) => {
			const astromech = real.createAstromech(...args);
			return {
				...astromech,
				codecovConfig: (existing: string | null, options?: Parameters<typeof astromech.codecovConfig>[1]) => {
					if (codecov.fail) throw new Error("cannot merge codecov.yml");
					return astromech.codecovConfig(existing, options);
				},
			};
		},
	};
});

let root: string;

function loadedFrom(raw: Partial<Parameters<typeof resolveConfig>[0]>): LoadedConfig {
	return {
		resolved: resolveConfig({ ...raw, providers: raw.providers ?? {} } as Parameters<typeof resolveConfig>[0]),
		filepath: join(root, "holocron.config.json"),
	};
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "repo-files-"));
	mkdirSync(join(root, ".git"));
});
afterEach(() => {
	codecov.fail = false;
	rmSync(root, { recursive: true, force: true });
});

describe("hooksEnabled", () => {
	it("takes the flag first, then config.hooks, then protection: strict", () => {
		const strict = loadedFrom({ name: "x", repo: { protection: "strict" } });
		expect(hooksEnabled({ loaded: strict })).toBe(true);
		expect(hooksEnabled({ loaded: strict, hooks: false })).toBe(false);
		expect(hooksEnabled({ loaded: loadedFrom({ name: "x" }) })).toBe(false);
		expect(hooksEnabled({ loaded: loadedFrom({ name: "x", hooks: true }) })).toBe(true);
		expect(hooksEnabled({ loaded: loadedFrom({ name: "x", hooks: { prePush: false } }) })).toBe(false);
		expect(hooksEnabled({ loaded: loadedFrom({ name: "x", hooks: { prePush: true } }) })).toBe(true);
	});
});

describe("generateConfigFiles", () => {
	it("generates the lint, editor and hook files, and skips the hooks when they are off", async () => {
		const entries = await generateConfigFiles({ loaded: loadedFrom({ name: "x" }), repoRoot: root });
		const steps = entries.map((e) => e.step);
		expect(steps).toContain("write .alexrc.json");
		expect(steps).toContain("write .husky/commit-msg");
		expect(steps).not.toContain("write .github/labeler.yml");
		expect(entries.find((e) => e.step === "write .husky/pre-push")).toMatchObject({
			kind: "skip",
			message: "git hooks disabled",
		});
		expect(entries.find((e) => e.step === "write codecov.yml")).toMatchObject({
			kind: "skip",
			message: "no test workflow configured",
		});
	});

	it("writes the hooks, the labeler and the DCO config when they apply", async () => {
		const loaded = loadedFrom({ name: "x", tasks: ["bookkeeping"], repo: { protection: "strict" } });
		const entries = await generateConfigFiles({ loaded, repoRoot: root, logger: getLogger() });
		const file = (path: string) => entries.find((e) => e.kind === "file" && e.path === path);
		expect(file(".github/labeler.yml")).toBeDefined();
		expect(file(".github/dependabot.yml")).toBeDefined();
		expect(file(".github/dco.yml")).toMatchObject({
			content: expect.stringContaining("repo-files/generate-config-files.ts"),
		});
		expect(file(".husky/pre-push")).toMatchObject({ note: expect.stringContaining("holocron run ci") });
		expect(file(".husky/pre-commit")).toBeDefined();
	});

	it("leaves the Dependabot and DCO files out for protection: none", async () => {
		const entries = await generateConfigFiles({
			loaded: loadedFrom({ name: "x", repo: { protection: "none" } }),
			repoRoot: root,
		});
		expect(entries.map((e) => e.step)).not.toContain("write .github/dco.yml");
	});

	it("adds the documentation flag to codecov.yml only when repoValidation.docsCoverage asks for it", async () => {
		writeFileSync(join(root, "codecov.yml"), "comment: false\n");
		const content = async (raw: Parameters<typeof loadedFrom>[0]) => {
			const entries = await generateConfigFiles({ loaded: loadedFrom(raw), repoRoot: root });
			return (entries.find((e) => e.step === "write codecov.yml") as { content: string }).content;
		};
		expect(await content({ name: "x" })).not.toContain("documentation");
		expect(await content({ name: "x", repoValidation: { docsCoverage: "off" } })).not.toContain("documentation");
		expect(await content({ name: "x", repoValidation: { docsCoverage: "required" } })).toContain(
			"- name: documentation"
		);
	});

	it("merges into the codecov.yml already there, and reports a codecov.yml it cannot read as a failed step", async () => {
		writeFileSync(join(root, "codecov.yml"), "comment: false\n");
		const ok = await generateConfigFiles({ loaded: loadedFrom({ name: "x" }), repoRoot: root });
		expect(ok.find((e) => e.step === "write codecov.yml")).toMatchObject({ kind: "file", note: "no components" });

		codecov.fail = true;
		const bad = await generateConfigFiles({ loaded: loadedFrom({ name: "x" }), repoRoot: root });
		expect(bad.find((e) => e.step === "write codecov.yml")).toMatchObject({
			kind: "error",
			message: "cannot merge codecov.yml",
		});
	});
});

describe("generateWorkflowFiles", () => {
	it("is empty without tasks, skips a task with no template and names the preview", () => {
		expect(generateWorkflowFiles({ loaded: loadedFrom({ name: "x" }), repoRoot: root })).toEqual([]);

		const entries = generateWorkflowFiles({
			loaded: loadedFrom({ name: "x", tasks: ["stale", "no.such.task"] }),
			repoRoot: root,
			logger: getLogger(),
		});
		expect(entries[0]).toMatchObject({
			kind: "file",
			path: ".github/workflows/stale.yml",
			step: "write workflow stale",
			syncStep: "sync workflow stale",
			workflow: { task: "stale", filename: "stale.yml" },
		});
		expect(entries[1]).toMatchObject({
			kind: "skip",
			message: 'unknown workflow "no.such.task" — no template available',
		});
	});
});

describe("generateTurboFiles", () => {
	it("skips when no task fans out, and writes turbo.json and the edits that go with it otherwise", async () => {
		const none = await generateTurboFiles({ loaded: loadedFrom({ name: "x" }), repoRoot: root });
		expect(none).toEqual([
			{
				kind: "skip",
				step: "write turbo.json",
				syncStep: "sync turbo.json",
				message: "no fan-out-eligible tasks configured",
			},
		]);

		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", scripts: { build: "tsc" } }, null, 2));
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
		const entries = await generateTurboFiles({
			loaded: loadedFrom({ name: "x", tasks: ["verification.typeSafety"] }),
			repoRoot: root,
			logger: getLogger(),
		});
		expect(entries.map((e) => (e.kind === "file" ? e.path : e.kind))).toEqual(["turbo.json", "package.json"]);
	});
});

describe("generateRepoFiles", () => {
	it("gives the workflows, then the config files, then turbo.json", async () => {
		const entries = await generateRepoFiles({
			loaded: loadedFrom({ name: "x", tasks: ["verification.typeSafety"] }),
			repoRoot: root,
		});
		const steps = entries.map((e) => e.step);
		expect(steps.indexOf("write workflow verification.typeSafety")).toBeLessThan(
			steps.indexOf("write .alexrc.json")
		);
		expect(steps.indexOf("write .alexrc.json")).toBeLessThan(steps.indexOf("write turbo.json"));
	});
});
