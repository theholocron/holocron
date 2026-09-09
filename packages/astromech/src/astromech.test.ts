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
		const report = astromech.run("test");
		expect(report.status).toBe("ok");
		expect(exec).toHaveBeenCalledWith("/repo/node_modules/.bin/vitest", ["run", "--coverage"], { cwd: "/repo" });
	});

	it("forwards passthrough / dryRun / required through to the runner", () => {
		const astromech = createAstromech({ ...fs({ "package.json": PKG }), print: () => {} });
		const report = astromech.run("build", { dryRun: true, required: true });
		expect(report.status).toBe("fail"); // no build tooling + required
	});

	it("forwards --filter to turbo", () => {
		const exec = vi.fn(() => ({ exitCode: 0 }));
		createAstromech({
			...fs({ "package.json": PKG, "turbo.json": JSON.stringify({ tasks: { test: {} } }) }),
			exec,
			print: () => {},
		}).run("test", { filter: "@scope/x" });
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "test", "--filter=@scope/x"], {
			cwd: "/repo",
		});
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
			const report = createAstromech({ cwd: dir }).run("build");
			// real listDir finds tsdown.config.ts → tsdown → mocked spawnSync → status null → exit -1
			expect(report.status).toBe("fail");
			expect(spawnSync).toHaveBeenCalledWith("tsdown", [], { cwd: dir, stdio: "inherit" });
			expect(log).toHaveBeenCalled();
		} finally {
			log.mockRestore();
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("resolves a linter binary via the real node_modules/.bin then PATH", async () => {
		const dir = await mkdtemp(join(tmpdir(), "astromech-lint-"));
		const binDir = await mkdtemp(join(tmpdir(), "astromech-bin-"));
		await writeFile(join(dir, "package.json"), JSON.stringify({ name: "x" }));
		await mkdir(join(dir, "node_modules", ".bin"), { recursive: true });
		await writeFile(join(dir, "node_modules", ".bin", "eslint"), "#!/bin/sh\nexit 0\n"); // node_modules/.bin hit
		await writeFile(join(binDir, "prettier"), "#!/bin/sh\nexit 0\n"); // PATH hit
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const savedPath = process.env["PATH"];
		process.env["PATH"] = `${binDir}:${savedPath ?? ""}`;
		try {
			const report = createAstromech({
				cwd: dir,
				// eslint → node_modules/.bin; prettier → PATH; markdownlint → not installed → null
				config: { tasks: [{ name: "lint", linters: ["eslint", "prettier", "markdownlint"] }] },
			}).run("lint", { dryRun: true });
			expect(report.status).toBe("dry-run");
			expect(report.command).toContain(join(dir, "node_modules", ".bin", "eslint"));
			expect(report.command).toContain(join(binDir, "prettier"));
			expect(report.command).not.toContain("markdownlint");

			// PATH unset → lookup still resolves node_modules/.bin, PATH walk is skipped
			delete process.env["PATH"];
			const noPath = createAstromech({
				cwd: dir,
				config: { tasks: [{ name: "lint", linters: ["eslint", "prettier"] }] },
			}).run("lint", { dryRun: true });
			expect(noPath.command).toContain(join(dir, "node_modules", ".bin", "eslint"));
			expect(noPath.command).not.toContain("prettier"); // not on the (empty) PATH now
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
			config: { tasks: ["lint", "test", { name: "release", with: { "run-build": false } }] },
		});
		const callers = astromech.thinCallers();
		expect([...callers.keys()].sort()).toEqual(["lint.yml", "release.yml", "test.yml"]);
		expect(callers.get("test.yml")).toContain("secrets: inherit");
		expect(callers.get("release.yml")).toContain("run-build: false");
	});

	it("skips tasks with ci: false and tasks with no template", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: { tasks: [{ name: "audit", ci: false }, "build", "lint"] },
		});
		expect([...astromech.thinCallers().keys()]).toEqual(["lint.yml"]);
	});

	it("injects enable-auto-commit + the super-linter-env manifest for the lint caller", () => {
		const astromech = createAstromech({ cwd: "/repo", config: { tasks: ["lint"] } });
		const lint = astromech.thinCallers().get("lint.yml")!;
		expect(lint).toContain("enable-auto-commit: true");
		// no fs available for /repo → auto-detect gives the always-on baseline
		expect(lint).toMatch(/# linters: prettier, yamllint, .*gitleaks/);
		expect(lint).toMatch(/super-linter-env: '\{.*"VALIDATE_YAML":"true".*\}'/);
		expect(lint).not.toContain('"VALIDATE_JAVASCRIPT_ES"'); // eslint is detect-gated
	});

	it("honours an explicit linters list on the lint caller", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: { tasks: [{ name: "lint", linters: ["eslint", "prettier"] }] },
		});
		const lint = astromech.thinCallers().get("lint.yml")!;
		expect(lint).toContain("# linters: eslint, prettier");
		expect(lint).toContain('"VALIDATE_JAVASCRIPT_ES":"true"');
		expect(lint).not.toContain('"VALIDATE_YAML"');
	});

	it("detects eslint from a repo config file", () => {
		const astromech = createAstromech({
			...fs({ "package.json": PKG, "eslint.config.ts": "" }),
			config: { tasks: ["lint"] },
		});
		const lint = astromech.thinCallers().get("lint.yml")!;
		expect(lint).toContain('"VALIDATE_JAVASCRIPT_ES":"true"');
	});

	it("emits the combined deploy+preview caller when preview resolves", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			orgContext: { org: "acme", domain: "acme.dev" },
			config: { tasks: [{ name: "deploy", with: { docs: true, preview: true } }] },
		});
		const deploy = astromech.thinCallers().get("deploy.yml")!;
		expect(deploy).toContain("pull_request:");
		expect(deploy).toContain("cloudflare-project: acme-preview");
		expect(deploy).toContain("- docs/**");
	});

	it("emits a plain deploy caller when preview is absent", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: { tasks: [{ name: "deploy", with: { docs: true } }] },
		});
		const deploy = astromech.thinCallers().get("deploy.yml")!;
		expect(deploy).not.toContain("pull_request:");
		expect(deploy).toContain("- docs/**");
	});

	it("returns an empty map with no config", () => {
		expect(createAstromech({ cwd: "/repo" }).thinCallers().size).toBe(0);
	});

	it("throws when the test caller disables both run-unit and run-storybook", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: { tasks: [{ name: "test", with: { "run-unit": false, "run-storybook": false } }] },
		});
		expect(() => astromech.thinCallers()).toThrow(/at least one of "run-unit" or "run-storybook"/);
	});

	it("does not throw when the test caller keeps run-unit enabled", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: { tasks: [{ name: "test", with: { "run-unit": true, "run-storybook": false } }] },
		});
		expect(() => astromech.thinCallers()).not.toThrow();
	});
});

describe("createAstromech().packageScripts", () => {
	it("emits the holocron entry plus `holocron run <task>` for runnable registry tasks", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: { tasks: ["lint", "test", "typecheck", "build"] },
		});
		expect(astromech.packageScripts()).toEqual({
			holocron: "holocron",
			lint: "holocron run lint",
			test: "holocron run test",
			typecheck: "holocron run typecheck",
			build: "holocron run build",
		});
	});

	it("skips local: false, non-registry, and local: null tasks", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: { tasks: [{ name: "test", local: false }, "release", "codeql", "lint"] },
		});
		expect(astromech.packageScripts()).toEqual({ holocron: "holocron", lint: "holocron run lint" });
	});

	it("honours a custom holocronScript", () => {
		const astromech = createAstromech({
			cwd: "/repo",
			config: { tasks: ["test"], holocronScript: "node packages/cli/dist/cli.mjs" },
		});
		expect(astromech.packageScripts()).toEqual({
			holocron: "node packages/cli/dist/cli.mjs",
			test: "holocron run test",
		});
	});

	it("returns {} with no config", () => {
		expect(createAstromech({ cwd: "/repo" }).packageScripts()).toEqual({});
	});

	it("returns {} when syncScripts is false", () => {
		expect(
			createAstromech({ cwd: "/repo", config: { tasks: ["test"], syncScripts: false } }).packageScripts()
		).toEqual({});
	});

	it("adds prepare: husky when hooks is true", () => {
		expect(
			createAstromech({ cwd: "/repo", config: { tasks: ["test"], hooks: true } }).packageScripts()
		).toMatchObject({ prepare: "husky" });
	});

	it("adds prepare: husky when hooks.prePush is not disabled", () => {
		expect(createAstromech({ cwd: "/repo", config: { tasks: ["test"], hooks: {} } }).packageScripts().prepare).toBe(
			"husky"
		);
	});

	it("omits prepare when hooks is false or unset", () => {
		expect(
			createAstromech({ cwd: "/repo", config: { tasks: ["test"], hooks: false } }).packageScripts().prepare
		).toBeUndefined();
		expect(
			createAstromech({ cwd: "/repo", config: { tasks: ["test"], hooks: { prePush: false } } }).packageScripts()
				.prepare
		).toBeUndefined();
		expect(createAstromech({ cwd: "/repo", config: { tasks: ["test"] } }).packageScripts().prepare).toBeUndefined();
	});
});

describe("createAstromech().superLinterConfig", () => {
	it("resolves the always-on baseline with no lint entry", () => {
		const sl = createAstromech({ cwd: "/repo", config: { tasks: ["test"] } }).superLinterConfig();
		expect(sl.linters).toContain("prettier");
		expect(sl.linters).not.toContain("eslint");
		expect(sl.env["VALIDATE_YAML"]).toBe("true");
	});

	it("honours the lint entry's explicit linters list", () => {
		const sl = createAstromech({
			cwd: "/repo",
			config: { tasks: [{ name: "lint", linters: ["eslint", "yamllint"] }] },
		}).superLinterConfig();
		expect(sl.linters).toEqual(["eslint", "yamllint"]);
		expect(sl.env["VALIDATE_JAVASCRIPT_ES"]).toBe("true");
	});

	it("auto-detects eslint from repo files when linters is omitted", () => {
		const sl = createAstromech({
			...fs({ "eslint.config.ts": "" }),
			config: { tasks: ["lint"] },
		}).superLinterConfig();
		expect(sl.linters[0]).toBe("eslint");
	});
});

describe("createAstromech().reusableTemplates", () => {
	it("delegates to the bare reusableTemplates() — config-independent", async () => {
		const { reusableTemplates } = await import("./reusable.js");
		const viaFactory = createAstromech({ cwd: "/repo" }).reusableTemplates();
		expect([...viaFactory.entries()]).toEqual([...reusableTemplates().entries()]);
		expect(viaFactory.has(".github/workflows/lint.yml")).toBe(true);
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
				tasks: [{ name: "lint", required: true }, { name: "test", required: true }, "typecheck"],
				extraRequiredChecks: ["codecov/patch"],
			},
		}).requiredChecks();
		expect(checks).toEqual(["Lint / Conclusion", "Test / Conclusion", "codecov/patch"]);
	});
});

describe("createAstromech().ci", () => {
	it("returns ok with no config (nothing to run)", () => {
		const report = createAstromech({ cwd: "/repo", print: () => {} }).ci();
		expect(report.status).toBe("ok");
		expect(report.jobs).toEqual([]);
	});

	it("runs the required tasks and forwards the lint linters", () => {
		const exec = vi.fn(() => ({ exitCode: 0 }));
		const report = createAstromech({
			...fs({ "package.json": PKG, "turbo.json": JSON.stringify({ tasks: { typecheck: {} } }) }),
			exec,
			print: () => {},
			config: { tasks: [{ name: "typecheck", required: true }] },
		}).ci();
		expect(report.status).toBe("ok");
		expect(report.jobs.map((j) => j.task)).toEqual(["typecheck"]);
		expect(exec).toHaveBeenCalledWith(expect.stringMatching(/turbo$/), ["run", "typecheck"], { cwd: "/repo" });
	});
});
