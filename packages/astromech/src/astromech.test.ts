import { describe, expect, it, vi } from "vitest";

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
		const lines: string[] = [];
		const astromech = createAstromech({
			...fs({ "package.json": PKG }),
			print: (l) => lines.push(l),
		});
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
});
