import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const spawnSync = vi.fn((_cmd: string, _args: string[], _opts: unknown) => ({ status: null as number | null }));
vi.mock("node:child_process", () => ({
	spawnSync: (...a: unknown[]) => spawnSync(...(a as [string, string[], unknown])),
}));

import { createAstromech } from "./astromech.js";

const PKG = JSON.stringify({ name: "@scope/x" });

function fs(files: Record<string, string>) {
	const CWD = "/repo";
	const rel = (p: string) => (p === CWD ? "" : p.startsWith(CWD + "/") ? p.slice(CWD.length + 1) : p);
	return {
		cwd: CWD,
		readFile: (p: string) => {
			const c = files[rel(p)];
			if (c === undefined) throw new Error(`ENOENT ${p}`);
			return c;
		},
		fileExists: (p: string) => files[rel(p)] !== undefined,
		listDir: (p: string) => {
			const prefix = rel(p) === "" ? "" : rel(p) + "/";
			return Object.keys(files)
				.filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/"))
				.map((f) => f.slice(prefix.length));
		},
	};
}

afterEach(() => spawnSync.mockClear());

describe("createAstromech().run", () => {
	it("delegates to the registry runner and returns the report", () => {
		const exec = vi.fn(() => ({ exitCode: 0 }));
		const astromech = createAstromech({
			...fs({ "package.json": PKG, "node_modules/.bin/vitest": "" }),
			exec,
			print: () => {},
		});
		const report = astromech.run("verification.unitTests");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith("/repo/node_modules/.bin/vitest", ["run", "--coverage"], { cwd: "/repo" });
	});

	it("forwards passthrough / dryRun / required through to the runner", () => {
		const astromech = createAstromech({ ...fs({ "package.json": PKG }), print: () => {} });
		const report = astromech.run("delivery.build", { dryRun: true, required: true });
		expect(report.status).toBe("fail"); // no build tooling + required
	});

	it("forwards --filter to turbo", () => {
		const exec = vi.fn(() => ({ exitCode: 0 }));
		createAstromech({
			...fs({ "package.json": PKG, "turbo.json": JSON.stringify({ tasks: { "verification.unitTests": {} } }) }),
			exec,
			print: () => {},
		}).run("verification.unitTests", { filter: "@scope/x" });
		expect(exec).toHaveBeenCalledWith(
			expect.stringMatching(/turbo$/),
			["run", "verification.unitTests", "--filter=@scope/x", "--", "--coverage"],
			{ cwd: "/repo" }
		);
	});

	it("threads a sub-job through to the registry — run('platform.repoValidation', { job })", () => {
		const exec = vi.fn(() => ({ exitCode: 0 }));
		const report = createAstromech({
			...fs({ "package.json": PKG }),
			exec,
			lookPath: (_cwd, bin) => (bin === "node" ? "/usr/bin/node" : null),
			print: () => {},
		}).run("platform.repoValidation", { job: "registry" });
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith("/usr/bin/node", ["scripts/validate-registry.mjs"], { cwd: "/repo" });
	});

	it("routes a structured logger through to run lines", () => {
		const warn = vi.fn();
		const astromech = createAstromech({
			...fs({ "package.json": PKG }),
			logger: { debug: () => {}, warn },
			print: () => {},
		});
		astromech.run("frobnicate");
		expect(warn).toHaveBeenCalledWith(expect.objectContaining({ status: "unknown" }), expect.any(String));
	});

	it("wires real node:fs / console.log / spawnSync when nothing is injected", async () => {
		const dir = await mkdtemp(join(tmpdir(), "astromech-"));
		await writeFile(join(dir, "package.json"), JSON.stringify({ name: "x" })); // real readFile
		await writeFile(join(dir, "tsdown.config.ts"), ""); // real listDir → detect
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const report = createAstromech({ cwd: dir }).run("delivery.build");
			// real listDir finds tsdown.config.ts → tsdown → mocked spawnSync → status null → exit -1
			expect(report.status).toBe("fail");
			expect(spawnSync).toHaveBeenCalledWith("tsdown", [], { cwd: dir, stdio: "inherit" });
			expect(log).toHaveBeenCalled();
		} finally {
			log.mockRestore();
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("resolves a linterGroup task's tools via the real node_modules/.bin then PATH", async () => {
		const dir = await mkdtemp(join(tmpdir(), "astromech-lint-"));
		const binDir = await mkdtemp(join(tmpdir(), "astromech-bin-"));
		await writeFile(join(dir, "package.json"), JSON.stringify({ name: "x" }));
		await mkdir(join(dir, "node_modules", ".bin"), { recursive: true });
		await writeFile(join(dir, "node_modules", ".bin", "prettier"), "#!/bin/sh\nexit 0\n"); // node_modules/.bin hit
		await writeFile(join(binDir, "editorconfig-checker"), "#!/bin/sh\nexit 0\n"); // PATH hit
		// markdownlint-cli2 not installed anywhere → skipped
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const savedPath = process.env["PATH"];
		process.env["PATH"] = `${binDir}:${savedPath ?? ""}`;
		try {
			const report = createAstromech({
				cwd: dir,
				config: { tasks: ["sourceQuality.formatting"] },
			}).run("sourceQuality.formatting", { dryRun: true });
			expect(report.status).toBe("dry-run");
			expect(report.command).toContain(join(dir, "node_modules", ".bin", "prettier"));
			expect(report.command).toContain(join(binDir, "editorconfig-checker"));
			expect(report.command).not.toContain("markdownlint");
		} finally {
			process.env["PATH"] = savedPath;
			log.mockRestore();
			await rm(dir, { recursive: true, force: true });
			await rm(binDir, { recursive: true, force: true });
		}
	});
});

describe("createAstromech().thinCallers", () => {
	it("returns one thin caller per templated task, keyed by <name>.yml", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: {
				tasks: [
					"sourceQuality.staticAnalysis",
					"verification.unitTests",
					{ name: "delivery.publish", with: { "run-build": false } },
				],
			},
		});
		const callers = astromech.thinCallers();
		expect([...callers.keys()].sort()).toEqual([
			"delivery.publish.yml",
			"sourceQuality.staticAnalysis.yml",
			"verification.unitTests.yml",
		]);
		expect(callers.get("verification.unitTests.yml")).toContain("secrets: inherit");
		expect(callers.get("delivery.publish.yml")).toContain("run-build: false");
	});

	it("skips tasks with ci: false and tasks with no template", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			// delivery.build has no dedicated thin-caller template — it's only
			// ever invoked as a step inside other tasks (delivery.bundleSize, …).
			config: {
				tasks: [{ name: "security.codeScanning", ci: false }, "delivery.build", "sourceQuality.staticAnalysis"],
			},
		});
		expect([...astromech.thinCallers().keys()]).toEqual(["sourceQuality.staticAnalysis.yml"]);
	});

	it("emits the combined deploy+preview caller when preview resolves", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			orgContext: { org: "acme", domain: "acme.dev" },
			config: { tasks: [{ name: "delivery.deploy", with: { docs: true, preview: true } }] },
		});
		const deploy = astromech.thinCallers().get("delivery.deploy.yml")!;
		expect(deploy).toContain("pull_request:");
		expect(deploy).toContain("cloudflare-project: acme-preview");
		expect(deploy).toContain("- docs/**");
	});

	it("emits a plain deploy caller when preview is absent", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: { tasks: [{ name: "delivery.deploy", with: { docs: true } }] },
		});
		const deploy = astromech.thinCallers().get("delivery.deploy.yml")!;
		expect(deploy).not.toContain("pull_request:");
		expect(deploy).toContain("- docs/**");
	});

	it("knowledge.docs implies the docs: true shorthand — a repo never has to spell it out", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			orgContext: { org: "acme", domain: "acme.dev" },
			config: { tasks: [{ name: "knowledge.docs", with: { preview: true } }] },
		});
		const docs = astromech.thinCallers().get("knowledge.docs.yml")!;
		expect(docs).toContain("- docs/**");
		expect(docs).toContain("cloudflare-project: acme-preview");
	});

	it("knowledge.components implies the storybook: […] shorthand — a repo never has to spell it out", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			orgContext: { org: "acme", domain: "acme.dev" },
			config: { tasks: [{ name: "knowledge.components", with: { preview: true } }] },
		});
		const components = astromech.thinCallers().get("knowledge.components.yml")!;
		expect(components).toContain("- src/**");
		expect(components).toContain("cloudflare-project: acme-preview");
	});

	it("returns an empty map with no config", () => {
		expect(createAstromech({ cwd: "/repo" }).thinCallers().size).toBe(0);
	});

	it("throws when the unit-tests caller disables both run-unit and run-storybook", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: {
				tasks: [{ name: "verification.unitTests", with: { "run-unit": false, "run-storybook": false } }],
			},
		});
		expect(() => astromech.thinCallers()).toThrow(/at least one of "run-unit" or "run-storybook"/);
	});

	it("does not throw when the unit-tests caller keeps run-unit enabled", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: { tasks: [{ name: "verification.unitTests", with: { "run-unit": true, "run-storybook": false } }] },
		});
		expect(() => astromech.thinCallers()).not.toThrow();
	});
});

describe("createAstromech().packageScripts", () => {
	it("emits the holocron entry plus `holocron run <task>` for runnable registry tasks", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: {
				tasks: [
					"sourceQuality.staticAnalysis",
					"verification.unitTests",
					"verification.typeSafety",
					"delivery.build",
				],
			},
		});
		expect(astromech.packageScripts()).toEqual({
			holocron: "holocron",
			"sourceQuality.staticAnalysis": "holocron run sourceQuality.staticAnalysis --",
			"verification.unitTests": "holocron run verification.unitTests --",
			"verification.typeSafety": "holocron run verification.typeSafety --",
			"delivery.build": "holocron run delivery.build --",
		});
	});

	it("skips local: false and genuinely local:null tasks (delivery.publish — semantic-release runs entirely in CI, not through `holocron run`); still includes a linterGroup task whose own `local` is null", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: {
				tasks: [
					{ name: "verification.unitTests", local: false },
					"delivery.publish",
					"sourceQuality.staticAnalysis",
				],
			},
		});
		expect(astromech.packageScripts()).toEqual({
			holocron: "holocron",
			"sourceQuality.staticAnalysis": "holocron run sourceQuality.staticAnalysis --",
		});
	});

	it("skips a genuinely local: null task (no linterGroup, no jobs)", () => {
		const astromech = createAstromech({ cwd: "/repo", config: { tasks: ["security.codeScanning"] } });
		expect(astromech.packageScripts()).toEqual({ holocron: "holocron" });
	});

	it("honours a custom holocronScript", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: { tasks: ["verification.unitTests"], holocronScript: "node packages/cli/dist/cli.mjs" },
		});
		expect(astromech.packageScripts()).toEqual({
			holocron: "node packages/cli/dist/cli.mjs",
			"verification.unitTests": "holocron run verification.unitTests --",
		});
	});

	it("returns {} with no config", () => {
		expect(createAstromech({ cwd: "/repo" }).packageScripts()).toEqual({});
	});

	it("returns {} when syncScripts is false", () => {
		expect(
			createAstromech({
				cwd: "/repo",
				config: { tasks: ["verification.unitTests"], syncScripts: false },
			}).packageScripts()
		).toEqual({});
	});

	it("adds prepare: husky when hooks is true", () => {
		expect(
			createAstromech({
				cwd: "/repo",
				config: { tasks: ["verification.unitTests"], hooks: true },
			}).packageScripts()
		).toMatchObject({ prepare: "husky" });
	});

	it("adds prepare: husky when hooks.prePush is not disabled", () => {
		expect(
			createAstromech({ cwd: "/repo", config: { tasks: ["verification.unitTests"], hooks: {} } }).packageScripts()
				.prepare
		).toBe("husky");
	});

	it("omits prepare when hooks is false or unset", () => {
		expect(
			createAstromech({
				cwd: "/repo",
				config: { tasks: ["verification.unitTests"], hooks: false },
			}).packageScripts().prepare
		).toBeUndefined();
		expect(
			createAstromech({
				cwd: "/repo",
				config: { tasks: ["verification.unitTests"], hooks: { prePush: false } },
			}).packageScripts().prepare
		).toBeUndefined();
		expect(
			createAstromech({ cwd: "/repo", config: { tasks: ["verification.unitTests"] } }).packageScripts().prepare
		).toBeUndefined();
	});
});

describe("createAstromech().reusableTemplates", () => {
	it("delegates to the bare reusableTemplates() — config-independent", async () => {
		const { reusableTemplates } = await import("./reusable.js");
		const viaFactory = createAstromech({ cwd: "/repo" }).reusableTemplates();
		expect([...viaFactory.entries()]).toEqual([...reusableTemplates().entries()]);
		expect(viaFactory.has(".github/workflows/verification.typeSafety.yml")).toBe(true);
	});
});

describe("createAstromech().requiredChecks", () => {
	it("returns [] with no config", () => {
		expect(createAstromech({ cwd: "/repo" }).requiredChecks()).toEqual([]);
	});

	it("derives contexts from required tasks + extraRequiredChecks", () => {
		const checks = createAstromech({
			cwd: "/repo",
			config: {
				tasks: [
					{ name: "sourceQuality.staticAnalysis", required: true },
					{ name: "verification.unitTests", required: true },
					"verification.typeSafety",
				],
				extraRequiredChecks: ["codecov/patch"],
			},
		}).requiredChecks();
		expect(checks).toEqual(["Static Analysis / Run eslint and actionlint", "Test / Conclusion", "codecov/patch"]);
	});
});

describe("createAstromech().codecovConfig", () => {
	it("delegates to the bare codecovConfig(cwd, existing) — cwd bound from the factory", async () => {
		const { codecovConfig } = await import("./codecov.js");
		const viaFactory = createAstromech({ cwd: "/repo" }).codecovConfig(null);
		expect(viaFactory).toEqual(codecovConfig("/repo", null));
		expect(viaFactory).toContain("Scaffolded by holocron setup");
	});

	it("merges into an existing file when one is passed", () => {
		const existing = "codecov:\n  require_ci_to_pass: true\n\ncomponent_management:\n  individual_components:\n";
		const out = createAstromech({ cwd: "/repo" }).codecovConfig(existing);
		expect(out).toContain("require_ci_to_pass: true");
	});
});

describe("createAstromech().ci", () => {
	it("returns ok with no config (nothing to run)", () => {
		const report = createAstromech({ cwd: "/repo", print: () => {} }).ci();
		expect(report.status).toBe("ok");
		expect(report.jobs).toEqual([]);
	});

	it("runs the required tasks", () => {
		const exec = vi.fn(() => ({ exitCode: 0 }));
		const report = createAstromech({
			...fs({ "package.json": PKG, "turbo.json": JSON.stringify({ tasks: { "verification.typeSafety": {} } }) }),
			exec,
			print: () => {},
			config: { tasks: [{ name: "verification.typeSafety", required: true }] },
		}).ci();
		expect(report.status).toBe("ok");
		expect(report.jobs.map((j) => j.task)).toEqual(["verification.typeSafety"]);
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "verification.typeSafety"], {
			cwd: "/repo",
		});
	});
});
