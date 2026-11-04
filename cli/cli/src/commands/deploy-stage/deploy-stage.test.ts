import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { stageDeploy } from "./deploy-stage.js";

let dir: string;

const write = (rel: string, body: string) => {
	mkdirSync(join(dir, rel, ".."), { recursive: true });
	writeFileSync(join(dir, rel), body);
};

/** A package with a built bundle, an entry, a `vercel.json` and the given `dependencies`. */
const makePackage = (bundle: string, dependencies: Record<string, string> = { yaml: "catalog:" }) => {
	write(
		"package.json",
		JSON.stringify({ name: "@x/app", version: "1.2.3", engines: { node: ">=22" }, scripts: {}, dependencies })
	);
	write("dist/index.mjs", bundle);
	write("api/webhook.mjs", "export default {};");
	write("vercel.json", "{}");
};

const resolveVersion = (_dir: string, name: string) => `9.9.9-${name}`;

beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "deploy-stage-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("stageDeploy", () => {
	it("copies the entry, bundle and vercel.json, and writes a trimmed package.json with pinned versions", () => {
		makePackage('import YAML from "yaml";');
		const lines: string[] = [];
		const report = stageDeploy({ packageDir: dir, resolveVersion, print: (l) => lines.push(l) });
		const out = join(dir, ".vercel-deploy");

		expect(report).toEqual({ status: "ok", outDir: out, dependencies: { yaml: "9.9.9-yaml" } });
		expect(readFileSync(join(out, "dist", "index.mjs"), "utf8")).toBe('import YAML from "yaml";');
		expect(existsSync(join(out, "api", "webhook.mjs"))).toBe(true);
		expect(existsSync(join(out, "vercel.json"))).toBe(true);
		expect(JSON.parse(readFileSync(join(out, "package.json"), "utf8"))).toEqual({
			name: "@x/app",
			version: "1.2.3",
			type: "module",
			engines: { node: "22.x" },
			dependencies: { yaml: "9.9.9-yaml" },
		});
		expect(lines.join("\n")).toContain("yaml@9.9.9-yaml");
	});

	it("writes to --out when given, replacing what was there", () => {
		makePackage("export {};");
		const out = join(dir, "elsewhere");
		write("elsewhere/stale.txt", "old");
		expect(stageDeploy({ packageDir: dir, outDir: out, resolveVersion }).status).toBe("ok");
		expect(existsSync(join(out, "stale.txt"))).toBe(false);
		expect(existsSync(join(out, "package.json"))).toBe(true);
	});

	it("refuses, writing nothing, when the bundle imports an undeclared package", () => {
		makePackage('import z from "zod";');
		const report = stageDeploy({ packageDir: dir, resolveVersion });
		expect(report.status).toBe("fail");
		expect(report.message).toContain("  - zod");
		expect(existsSync(join(dir, ".vercel-deploy"))).toBe(false);
	});

	it("fails when the bundle has not been built", () => {
		write("package.json", "{}");
		const report = stageDeploy({ packageDir: dir, resolveVersion });
		expect(report).toMatchObject({ status: "fail" });
		expect(report.message).toContain("delivery.build");
	});

	it("fails naming the dependency that is not installed", () => {
		makePackage("export {};");
		const report = stageDeploy({ packageDir: dir });
		expect(report.status).toBe("fail");
		expect(report.message).toContain('"yaml"');
		expect(report.message).toContain("pnpm install");
	});
});
