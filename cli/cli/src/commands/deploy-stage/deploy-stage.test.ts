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

	it("also pins the required peers of each dependency, which legacy-peer-deps would not install", () => {
		makePackage('import YAML from "yaml";');
		const report = stageDeploy({
			packageDir: dir,
			resolveVersion,
			resolvePeers: (_, dependency): Record<string, string> =>
				dependency === "yaml" ? { "peer-b": "2.0.0", "peer-a": "1.0.0" } : {},
		});
		expect(report.dependencies).toEqual({ "peer-a": "1.0.0", "peer-b": "2.0.0", yaml: "9.9.9-yaml" });
		expect(Object.keys(report.dependencies ?? {})).toEqual(["peer-a", "peer-b", "yaml"]);
		const staged = JSON.parse(readFileSync(join(dir, ".vercel-deploy", "package.json"), "utf8"));
		expect(staged.dependencies).toEqual({ "peer-a": "1.0.0", "peer-b": "2.0.0", yaml: "9.9.9-yaml" });
	});

	it("pins an own-scope alpha dependency and its peers to npm's alpha tag, and says what moved", () => {
		makePackage("export {};", { "@theholocron/plugin": "workspace:^" });
		const lines: string[] = [];
		const report = stageDeploy({
			packageDir: dir,
			resolveVersion: () => "5.0.0-alpha.132",
			resolvePeers: () => ({ "@theholocron/cli": "5.0.0-alpha.394" }),
			alphaRelease: (name) =>
				name === "@theholocron/plugin"
					? { version: "5.0.0-alpha.393", peerDependencies: { "@theholocron/cli": "5.0.0-alpha.392" } }
					: { version: "5.0.0-alpha.393" },
			print: (l) => lines.push(l),
		});
		expect(report.dependencies).toEqual({
			"@theholocron/cli": "5.0.0-alpha.393",
			"@theholocron/plugin": "5.0.0-alpha.393",
		});
		const staged = JSON.parse(readFileSync(join(dir, ".vercel-deploy", "package.json"), "utf8"));
		expect(staged.dependencies).toEqual(report.dependencies);
		expect(lines).toContain("  pinned to npm's alpha tag: @theholocron/plugin 5.0.0-alpha.132 → 5.0.0-alpha.393");
		expect(lines).toContain("  pinned to npm's alpha tag: @theholocron/cli 5.0.0-alpha.394 → 5.0.0-alpha.393");
		expect(lines.some((l) => l.startsWith("  warning: @theholocron/plugin@5.0.0-alpha.393 peers"))).toBe(true);
	});

	it("fails, writing nothing, when npm's alpha tag cannot be looked up", () => {
		makePackage("export {};", { "@theholocron/plugin": "workspace:^" });
		const report = stageDeploy({
			packageDir: dir,
			resolveVersion: () => "5.0.0-alpha.132",
			alphaRelease: () => {
				throw new Error(
					"cannot look up @theholocron/plugin@alpha on npm (is the registry reachable?): ENOTFOUND"
				);
			},
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("ENOTFOUND");
		expect(existsSync(join(dir, ".vercel-deploy"))).toBe(false);
	});

	it("keeps a dependency's own pinned version over a peer of the same name", () => {
		makePackage('import YAML from "yaml";');
		const report = stageDeploy({
			packageDir: dir,
			resolveVersion,
			resolvePeers: () => ({ yaml: "0.0.1" }),
		});
		expect(report.dependencies).toEqual({ yaml: "9.9.9-yaml" });
	});

	it("writes an .npmrc that skips peer resolution, so a strict install cannot fail ERESOLVE", () => {
		makePackage("export {};");
		stageDeploy({ packageDir: dir, resolveVersion });
		expect(readFileSync(join(dir, ".vercel-deploy", ".npmrc"), "utf8")).toBe("legacy-peer-deps=true\n");
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

	it("reads each dependency's version from the package's installed node_modules by default", () => {
		makePackage("export {};");
		write("node_modules/yaml/package.json", JSON.stringify({ version: "2.8.1" }));
		const report = stageDeploy({ packageDir: dir });
		expect(report).toMatchObject({ status: "ok", dependencies: { yaml: "2.8.1" } });
	});

	it("stages a package that declares no dependencies, printing nothing when given no print", () => {
		write("package.json", JSON.stringify({ name: "@x/app", version: "1.0.0" }));
		write("dist/index.mjs", "export {};");
		write("api/webhook.mjs", "export default {};");
		write("vercel.json", "{}");
		const report = stageDeploy({ packageDir: dir });
		expect(report).toMatchObject({ status: "ok", dependencies: {} });
		expect(JSON.parse(readFileSync(join(dir, ".vercel-deploy", "package.json"), "utf8"))).not.toHaveProperty(
			"engines.node"
		);
	});
});
