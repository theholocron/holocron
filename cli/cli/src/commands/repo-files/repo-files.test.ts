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
// The legacy-name gate is shut while `CI_HOME` points at the frozen copies; a test opens it as `ci-v1` will.
const gate = vi.hoisted(() => ({ open: false }));
vi.mock("@theholocron/astromech", async (importOriginal) => {
	const real = await importOriginal<typeof import("@theholocron/astromech")>();
	return {
		...real,
		legacyGate: () => !gate.open,
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
	gate.open = false;
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
			content: expect.stringContaining("astromech/src/templates/configs/dco/create-config.ts"),
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
			workflow: { task: "mark-stale", filename: "stale.yml" },
		});
		expect(entries[1]).toMatchObject({
			kind: "skip",
			message: 'unknown workflow "no.such.task" — no template available',
		});
	});
});

describe("generateWorkflowFiles in the repo that hosts the reusables", () => {
	function host(name = "@theholocron/ci") {
		mkdirSync(join(root, "ci"));
		writeFileSync(join(root, "ci", "package.json"), JSON.stringify({ name }));
	}
	const generate = () =>
		generateWorkflowFiles({
			loaded: loadedFrom({ name: "x", tasks: ["stale", "verification.unitTests"] }),
			repoRoot: root,
			logger: getLogger(),
		});

	it("names the callers ci.<name>.yml and has them call the reusable in the same checkout", () => {
		host();
		const callers = generate().filter(
			(entry) => entry.kind === "file" && entry.path.includes("/ci.") && entry.step.startsWith("write workflow")
		);
		expect(callers.map((entry) => entry.kind === "file" && entry.workflow.filename)).toEqual([
			"ci.mark-stale.yml",
			"ci.test-unit.yml",
		]);
		const stale = callers[0]!;
		if (stale.kind !== "file") throw new Error("expected a file");
		expect(stale.path).toBe(".github/workflows/ci.mark-stale.yml");
		expect(stale.content).toContain("    uses: ./.github/workflows/mark-stale.yml\n");
		expect(stale.content).not.toContain("theholocron/.github/.github/workflows");
		expect(stale.workflow).toEqual({ task: "mark-stale", filename: "ci.mark-stale.yml" });
		// the workflow, the job and the file are all named for the task id
		expect(stale.content).toMatch(/^name: mark-stale$/m);
		expect(stale.content).toMatch(/^ {2}mark-stale:\n {4}name: mark-stale$/m);
		const unit = callers[1]!;
		if (unit.kind !== "file") throw new Error("expected a file");
		expect(unit.content).toMatch(/^name: test:unit$/m);
		expect(unit.content).toMatch(/^ {2}test-unit:\n {4}name: test:unit$/m);
		expect(unit.content).toContain("    uses: ./.github/workflows/test-unit.yml\n");
	});

	it("writes each reusable that only runs when called, under its own name, from ci/workflows", () => {
		host();
		const reusables = generate().filter(
			(entry) => entry.kind === "file" && entry.step.startsWith("write reusable")
		);
		const names = reusables.map((entry) => (entry.kind === "file" ? entry.path : ""));
		expect(names.length).toBeGreaterThan(25);
		expect(names).toContain(".github/workflows/mark-stale.yml");
		expect(names).toContain(".github/workflows/test-unit.yml");
		expect(names.filter((name) => /workflows\/[\w-]+\.[\w-]+\.yml$/.test(name))).toEqual([]);
		for (const unlisted of ["tag", "sync-dispatch", "check-dispatched"]) {
			expect(names).not.toContain(`.github/workflows/${unlisted}.yml`);
		}
		const stale = reusables.find((entry) => entry.kind === "file" && entry.path.endsWith("/mark-stale.yml"));
		if (!stale || stale.kind !== "file") throw new Error("expected stale");
		expect(stale.content).toMatch(/^# Source: {2}theholocron\/holocron · ci\/workflows\/mark-stale\.yml$/m);
		expect(stale.content).toContain("# Source package: .\n");
		expect(stale.content).toMatch(/^on: # yamllint disable-line rule:truthy\n {2}workflow_call:/m);
		expect(stale.workflow).toEqual({ task: "mark-stale", filename: "mark-stale.yml" });
		// a leaf of a suite is generated from its folder: `test:unit` is `ci/workflows/test/unit.yml`
		const unit = reusables.find((entry) => entry.kind === "file" && entry.path.endsWith("/test-unit.yml"));
		if (!unit || unit.kind !== "file") throw new Error("expected test-unit");
		expect(unit.content).toMatch(/^# Source: {2}theholocron\/holocron · ci\/workflows\/test\/unit\.yml$/m);
		expect(unit.workflow).toEqual({ task: "test:unit", filename: "test-unit.yml" });
	});

	describe("the ci aggregate caller", () => {
		const aggregate = () =>
			generateWorkflowFiles({
				loaded: loadedFrom({
					name: "x",
					tasks: ["stale", { name: "typecheck", required: true }],
					extraRequiredChecks: ["codecov/patch", "Generated files / Check"],
				}),
				repoRoot: root,
				logger: getLogger(),
			});

		it("is written as ci.ci.yml, calling the reusable in the same checkout, with what the manifest requires", () => {
			host();
			const entry = aggregate().find((e) => e.kind === "file" && e.path === ".github/workflows/ci.ci.yml");
			if (!entry || entry.kind !== "file") throw new Error("expected ci.ci.yml");
			expect(entry.workflow).toEqual({ task: "ci", filename: "ci.ci.yml" });
			expect(entry.step).toBe("write workflow ci");
			expect(entry.syncStep).toBe("sync workflow ci");
			expect(entry.content).toContain("# Source package: .\n");
			expect(entry.content).toContain("    uses: ./.github/workflows/ci.yml\n");
			expect(entry.content).toContain(`      expected: '["typecheck","Generated files"]'\n`);
			expect(entry.content).toContain(`      statuses: '["codecov/patch"]'\n`);
		});

		it("is not written when nothing is required", () => {
			host();
			expect(generate().some((e) => e.kind === "file" && e.path.endsWith("ci.ci.yml"))).toBe(false);
		});

		it("is not written in a repo that does not host the reusables", () => {
			expect(aggregate().some((e) => e.kind === "file" && e.path.endsWith("ci.yml"))).toBe(false);
		});

		it("is not written from a package's own config", () => {
			host();
			mkdirSync(join(root, "apps"));
			mkdirSync(join(root, "apps", "web"));
			const entries = generateWorkflowFiles({
				loaded: {
					...loadedFrom({
						name: "x",
						tasks: [{ name: "typecheck", required: true }],
					}),
					filepath: join(root, "apps", "web", "holocron.config.json"),
				},
				repoRoot: root,
				logger: getLogger(),
			});
			expect(entries.some((e) => e.kind === "file" && e.path.endsWith("ci.ci.yml"))).toBe(false);
		});
	});

	it("leaves a repo without the ci package alone: plain names, references, no reusables", () => {
		const entries = generate();
		expect(entries.map((entry) => (entry.kind === "file" ? entry.path : ""))).toEqual([
			".github/workflows/stale.yml",
			".github/workflows/verification.unitTests.yml",
		]);
		const stale = entries[0]!;
		if (stale.kind !== "file") throw new Error("expected a file");
		expect(stale.content).toContain("theholocron/.github/.github/workflows/stale.yml@main");
		// the legacy-name gate: the callers of a repo that still calls the frozen reusables keep their old names
		expect(stale.content).toMatch(/^name: Stale$/m);
		expect(stale.content).toMatch(/^ {2}stale:\n/m);
		const unit = entries[1]!;
		if (unit.kind !== "file") throw new Error("expected a file");
		expect(unit.content).toMatch(/^name: Verification$/m);
		expect(unit.content).toMatch(/^ {2}test:\n {4}name: Test$/m);
		expect(unit.workflow).toEqual({ task: "test:unit", filename: "verification.unitTests.yml" });
	});

	it("gives every repo the flat names once the gate is open (callers on ci-v1)", () => {
		gate.open = true;
		const entries = generate();
		expect(entries.map((entry) => (entry.kind === "file" ? entry.path : ""))).toEqual([
			".github/workflows/mark-stale.yml",
			".github/workflows/test-unit.yml",
		]);
		const unit = entries[1]!;
		if (unit.kind !== "file") throw new Error("expected a file");
		expect(unit.content).toMatch(/^name: test:unit$/m);
		expect(unit.workflow).toEqual({ task: "test:unit", filename: "test-unit.yml" });
	});

	describe("the formatting split", () => {
		const tasks = (list: unknown[]) =>
			generateWorkflowFiles({
				loaded: loadedFrom({ name: "x", tasks: list as never }),
				repoRoot: root,
				logger: getLogger(),
			}).map((entry) => (entry.kind === "file" ? entry.path : `skip ${entry.step}`));

		it("writes a caller for lint:editorconfig and one for lint:markdown, and none for format", () => {
			mkdirSync(join(root, "ci"));
			writeFileSync(join(root, "ci", "package.json"), JSON.stringify({ name: "@theholocron/ci" }));
			const paths = tasks(["lint:editorconfig", "lint:markdown", "format"]);
			expect(paths.filter((path) => path.includes("/ci.lint-"))).toEqual([
				".github/workflows/ci.lint-editorconfig.yml",
				".github/workflows/ci.lint-markdown.yml",
			]);
			expect(paths.some((path) => path.includes("format"))).toBe(false);
		});

		it("keeps the one formatting caller of the frozen reusable in a repo on the legacy gate", () => {
			expect(new Set(tasks(["lint:editorconfig", "lint:markdown", "format"]))).toEqual(
				new Set([".github/workflows/sourceQuality.formatting.yml"])
			);
		});

		it("still writes it for lint:markdown alone, calling the frozen reusable, unless the task has ci: false", () => {
			expect(tasks(["lint:markdown"])).toEqual([".github/workflows/sourceQuality.formatting.yml"]);
			expect(tasks([{ name: "lint:markdown", ci: false }])).toEqual([]);
			// `format` alone has never written one
			expect(tasks(["format"])).toEqual([]);
		});
	});

	describe("the validate suite", () => {
		const paths = (tasks: string[], loadedTasks = tasks) =>
			generateWorkflowFiles({
				loaded: loadedFrom({ name: "x", tasks: loadedTasks }),
				repoRoot: root,
				logger: getLogger(),
			})
				.filter((entry) => entry.kind === "file" && entry.step.startsWith("write workflow"))
				.map((entry) => (entry.kind === "file" ? entry.path : ""));

		it("writes one caller per leaf, and the alias `validate` writes both", () => {
			host();
			expect(paths(["validate:specs", "validate:docs"])).toEqual([
				".github/workflows/ci.validate-specs.yml",
				".github/workflows/ci.validate-docs.yml",
			]);
			expect(paths(["validate"])).toEqual([
				".github/workflows/ci.validate-specs.yml",
				".github/workflows/ci.validate-docs.yml",
			]);
			expect(paths(["platform.repoValidation"])).toEqual([
				".github/workflows/ci.validate-specs.yml",
				".github/workflows/ci.validate-docs.yml",
			]);
		});

		it("names each caller for its leaf and has it call its own reusable", () => {
			host();
			const docs = generateWorkflowFiles({
				loaded: loadedFrom({ name: "x", tasks: ["validate:docs"] }),
				repoRoot: root,
				logger: getLogger(),
			}).find((entry) => entry.kind === "file" && entry.path.endsWith("ci.validate-docs.yml"));
			if (!docs || docs.kind !== "file") throw new Error("expected a file");
			expect(docs.content).toMatch(/^name: validate:docs$/m);
			expect(docs.content).toMatch(/^ {2}validate-docs:\n {4}name: validate:docs$/m);
			expect(docs.content).toContain("    uses: ./.github/workflows/validate-docs.yml\n");
		});

		it("gives a repo that calls the frozen reusables the one caller the old workflow was", () => {
			expect(paths(["validate"])).toEqual([".github/workflows/platform.repoValidation.yml"]);
			expect(paths(["platform.repoValidation"])).toEqual([".github/workflows/platform.repoValidation.yml"]);
		});

		it("gives every repo both flat callers once the gate is open", () => {
			gate.open = true;
			expect(paths(["validate"])).toEqual([
				".github/workflows/validate-specs.yml",
				".github/workflows/validate-docs.yml",
			]);
		});
	});

	it("does not take another package named ci for the hosting package", () => {
		host("@acme/ci");
		expect(generate().every((entry) => entry.kind !== "file" || !entry.path.includes("/ci."))).toBe(true);
	});

	it("does not write the reusables from a package's own config, only from the root's", () => {
		host();
		mkdirSync(join(root, "apps"));
		mkdirSync(join(root, "apps", "web"));
		const entries = generateWorkflowFiles({
			loaded: {
				...loadedFrom({ name: "x", tasks: ["stale"] }),
				filepath: join(root, "apps", "web", "holocron.config.json"),
			},
			repoRoot: root,
			logger: getLogger(),
		});
		expect(entries.map((entry) => (entry.kind === "file" ? entry.path : ""))).toEqual([
			".github/workflows/ci.mark-stale.yml",
		]);
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
