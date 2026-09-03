import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runNpmBumpVersions } from "./npm-bump-versions.js";

const CWD = "/repo";
const PACKAGES_DIR = join(CWD, "packages");

function makeFs(files: Record<string, Record<string, unknown>>) {
	const written: Record<string, string> = {};
	const toRel = (p: string) => (p.startsWith(CWD + "/") ? p.slice(CWD.length + 1) : p);
	const readFile = (p: string): string => {
		const rel = toRel(p);
		const data = files[rel];
		if (!data) throw new Error(`ENOENT: ${p}`);
		return JSON.stringify(data, null, 2) + "\n";
	};
	const writeFile = (p: string, c: string) => {
		written[p] = c;
	};
	const listDir = (p: string): string[] => {
		if (p !== PACKAGES_DIR) throw new Error(`ENOENT: ${p}`);
		return Object.keys(files)
			.filter((k) => k.startsWith("packages/"))
			.map((k) => k.split("/")[1] as string)
			.filter((v, i, a) => a.indexOf(v) === i);
	};
	const isDir = (p: string): boolean => {
		const rel = toRel(p);
		return rel.startsWith("packages/") && !rel.endsWith("package.json");
	};
	return { readFile, writeFile, listDir, isDir, written };
}

describe("runNpmBumpVersions", () => {
	it("bumps all non-private packages under packages/", async () => {
		const { readFile, writeFile, listDir, isDir, written } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"packages/pkg-a/package.json": { name: "@acme/pkg-a", version: "4.1.0" },
			"packages/pkg-b/package.json": { name: "@acme/pkg-b", version: "4.1.0" },
		});
		const report = await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile,
			listDir,
			isDir,
		});
		expect(report.status).toBe("ok");
		expect(report.bumped).toEqual(["root", "packages/pkg-a", "packages/pkg-b"]);
		expect(JSON.parse(written[join(CWD, "packages/pkg-a/package.json")]!).version).toBe("4.2.0");
		expect(JSON.parse(written[join(CWD, "packages/pkg-b/package.json")]!).version).toBe("4.2.0");
	});

	it("skips private packages", async () => {
		const { readFile, writeFile, listDir, isDir } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"packages/public/package.json": { name: "@acme/public", version: "4.1.0" },
			"packages/private/package.json": { name: "@acme/private", version: "4.1.0", private: true },
		});
		const report = await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile,
			listDir,
			isDir,
		});
		expect(report.bumped).toEqual(["root", "packages/public"]);
		expect(report.skipped).toContain("packages/private");
	});

	it("bumps the root package even when it is private", async () => {
		const { readFile, writeFile, listDir, isDir, written } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"packages/pkg/package.json": { name: "@acme/pkg", version: "4.1.0" },
		});
		const report = await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile,
			listDir,
			isDir,
		});
		expect(report.bumped).toContain("root");
		expect(report.skipped).not.toContain("root");
		expect(JSON.parse(written[join(CWD, "package.json")]!).version).toBe("4.2.0");
	});

	it("bumps the root package when it is not private", async () => {
		const { readFile, writeFile, listDir, isDir, written } = makeFs({
			"package.json": { name: "root", version: "4.1.0" },
			"packages/pkg/package.json": { name: "@acme/pkg", version: "4.1.0" },
		});
		const report = await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile,
			listDir,
			isDir,
		});
		expect(report.bumped).toContain("root");
		expect(JSON.parse(written[join(CWD, "package.json")]!).version).toBe("4.2.0");
	});

	it("succeeds with only root when packages/ directory does not exist", async () => {
		const { readFile, writeFile, isDir, written } = makeFs({
			"package.json": { name: "root", version: "1.3.2" },
		});
		const report = await runNpmBumpVersions({
			version: "1.4.0",
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile,
			listDir: () => {
				throw new Error("ENOENT");
			},
			isDir,
		});
		expect(report.status).toBe("ok");
		expect(report.bumped).toEqual(["root"]);
		expect(JSON.parse(written[join(CWD, "package.json")]!).version).toBe("1.4.0");
	});

	it("returns dry-run status when packages/ does not exist and dryRun is true", async () => {
		const { readFile, writeFile, isDir, written } = makeFs({
			"package.json": { name: "root", version: "1.3.2" },
		});
		const report = await runNpmBumpVersions({
			version: "1.4.0",
			cwd: CWD,
			dryRun: true,
			print: () => {},
			readFile,
			writeFile,
			listDir: () => {
				throw new Error("ENOENT");
			},
			isDir,
		});
		expect(report.status).toBe("dry-run");
		expect(report.bumped).toEqual(["root"]);
		expect(Object.keys(written)).toHaveLength(0);
	});

	it("dry-run prints changes but does not write files", async () => {
		const lines: string[] = [];
		const { readFile, writeFile, listDir, isDir, written } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"packages/pkg/package.json": { name: "@acme/pkg", version: "4.1.0" },
		});
		const report = await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			dryRun: true,
			print: (l) => lines.push(l),
			readFile,
			writeFile,
			listDir,
			isDir,
		});
		expect(report.status).toBe("dry-run");
		expect(report.bumped).toContain("packages/pkg");
		expect(Object.keys(written)).toHaveLength(0);
		expect(lines.some((l) => l.includes("dry-run"))).toBe(true);
		expect(lines.some((l) => l.includes("4.1.0") && l.includes("4.2.0"))).toBe(true);
	});

	it("warns and skips package dirs that have no package.json", async () => {
		const lines: string[] = [];
		const { readFile, writeFile, isDir } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"packages/pkg/package.json": { name: "@acme/pkg", version: "4.1.0" },
		});
		const report = await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			print: (l) => lines.push(l),
			readFile: (p) => {
				if (p.includes("no-manifest")) throw new Error("ENOENT");
				return readFile(p);
			},
			writeFile,
			listDir: () => ["pkg", "no-manifest"],
			isDir,
		});
		expect(report.bumped).toEqual(["root", "packages/pkg"]);
		expect(lines.some((l) => l.includes("no-manifest") && l.includes("skipping"))).toBe(true);
	});

	it("prints the version and cwd header", async () => {
		const lines: string[] = [];
		const { readFile, writeFile, listDir, isDir } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"packages/pkg/package.json": { name: "@acme/pkg", version: "4.1.0" },
		});
		await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			print: (l) => lines.push(l),
			readFile,
			writeFile,
			listDir,
			isDir,
		});
		expect(lines[0]).toContain("4.2.0");
	});

	it("reports and skips root package.json with invalid JSON", async () => {
		const lines: string[] = [];
		const { writeFile, listDir, isDir } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"packages/pkg/package.json": { name: "@acme/pkg", version: "4.1.0" },
		});
		const rootPath = join(CWD, "package.json");
		const report = await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			print: (l) => lines.push(l),
			readFile: (p) => {
				if (p === rootPath) return "{ invalid json }";
				return JSON.stringify({ name: "@acme/pkg", version: "4.1.0" }, null, 2) + "\n";
			},
			writeFile,
			listDir,
			isDir,
		});
		expect(report.status).toBe("ok");
		expect(lines.some((l) => l.includes("could not parse"))).toBe(true);
	});

	it("skips directory entries when isDir throws", async () => {
		const { readFile, writeFile, listDir } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"packages/pkg/package.json": { name: "@acme/pkg", version: "4.1.0" },
		});
		const report = await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile,
			listDir,
			isDir: () => {
				throw new Error("EPERM: permission denied");
			},
		});
		expect(report.status).toBe("ok");
		expect(report.bumped).toContain("root");
	});
});
