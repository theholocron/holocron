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
