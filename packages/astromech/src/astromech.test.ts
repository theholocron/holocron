import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
