import { join } from "node:path";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it } from "vitest";

import { runNpmBumpVersions } from "./npm-bump-versions.js";

const CWD = "/repo";
const PACKAGES_DIR = join(CWD, "packages");

/** A JSON file's contents, or a string for a non-JSON file such as `pnpm-workspace.yaml`. */
function makeFs(files: Record<string, Record<string, unknown> | string>) {
	const written: Record<string, string> = {};
	const toRel = (p: string) => (p.startsWith(CWD + "/") ? p.slice(CWD.length + 1) : p);
	const readFile = (p: string): string => {
		const rel = toRel(p);
		const data = files[rel];
		if (!data) throw new Error(`ENOENT: ${p}`);
		return typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n";
	};
	const writeFile = (p: string, c: string) => {
		written[p] = c;
	};
	const listDir = (p: string): string[] => {
		const prefix = `${toRel(p)}/`;
		const names = Object.keys(files)
			.filter((k) => k.startsWith(prefix))
			.map((k) => k.slice(prefix.length).split("/")[0] as string)
			.filter((v, i, a) => a.indexOf(v) === i);
		if (names.length === 0) throw new Error(`ENOENT: ${p}`);
		return names;
	};
	const isDir = (p: string): boolean => {
		const rel = toRel(p);
		return rel.includes("/") && !rel.endsWith(".json");
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
		const log = fakeLogger();
		const report = await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile,
			listDir,
			isDir,
			logger: log,
		});
		expect(report.status).toBe("ok");
		expect(report.bumped).toEqual(["root", "packages/pkg-a", "packages/pkg-b"]);
		expect(log.info).toHaveBeenCalledWith(
			expect.objectContaining({ version: "4.2.0" }),
			"npm bump-versions: start"
		);
		expect(log.info).toHaveBeenCalledWith(
			expect.objectContaining({ bumped: 3, status: "ok" }),
			"npm bump-versions: done"
		);
		expect(JSON.parse(written[join(CWD, "packages/pkg-a/package.json")]!).version).toBe("4.2.0");
		expect(JSON.parse(written[join(CWD, "packages/pkg-b/package.json")]!).version).toBe("4.2.0");
	});

	it("keeps each package.json's own indent when bumping (tabs, 4 spaces, CRLF)", async () => {
		const raw: Record<string, string> = {
			"package.json": '{\n\t"name": "root",\n\t"version": "0.0.0",\n\t"private": true\n}\n',
			"packages/pkg-a/package.json": '{\n    "name": "@acme/pkg-a",\n    "version": "4.1.0"\n}\n',
			"packages/pkg-b/package.json": '{\r\n  "name": "@acme/pkg-b",\r\n  "version": "4.1.0"\r\n}\r\n',
		};
		const { listDir, isDir, written } = makeFs({
			"package.json": {},
			"packages/pkg-a/package.json": {},
			"packages/pkg-b/package.json": {},
		});
		const readFile = (p: string): string => {
			const text = raw[p.startsWith(CWD + "/") ? p.slice(CWD.length + 1) : p];
			if (text === undefined) throw new Error(`ENOENT: ${p}`);
			return text;
		};
		await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile: (p, c) => {
				written[p] = c;
			},
			listDir,
			isDir,
			logger: fakeLogger(),
		});
		expect(written[join(CWD, "package.json")]).toBe(
			'{\n\t"name": "root",\n\t"version": "4.2.0",\n\t"private": true\n}\n'
		);
		expect(written[join(CWD, "packages/pkg-a/package.json")]).toBe(
			'{\n    "name": "@acme/pkg-a",\n    "version": "4.2.0"\n}\n'
		);
		expect(written[join(CWD, "packages/pkg-b/package.json")]).toBe(
			'{\r\n  "name": "@acme/pkg-b",\r\n  "version": "4.2.0"\r\n}\r\n'
		);
	});

	it("bumps non-private packages under plugins/ alongside packages/ (holocron#993 regression)", async () => {
		const { readFile, writeFile, listDir, isDir, written } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"packages/cli/package.json": { name: "@acme/cli", version: "4.1.0" },
			"plugins/plugin-a/package.json": { name: "@acme/plugin-a", version: "4.1.0" },
			"plugins/plugin-b/package.json": { name: "@acme/plugin-b", version: "4.1.0", private: true },
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
		expect(report.bumped).toEqual(["root", "packages/cli", "plugins/plugin-a"]);
		expect(report.skipped).toContain("plugins/plugin-b");
		expect(JSON.parse(written[join(CWD, "plugins/plugin-a/package.json")]!).version).toBe("4.2.0");
	});

	it("bumps plugins/* when there is no packages/ dir at all", async () => {
		const { readFile, writeFile, listDir, isDir, written } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"plugins/plugin-a/package.json": { name: "@acme/plugin-a", version: "4.1.0" },
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
		expect(report.bumped).toEqual(["root", "plugins/plugin-a"]);
		expect(JSON.parse(written[join(CWD, "plugins/plugin-a/package.json")]!).version).toBe("4.2.0");
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

	it("skips a non-directory entry when isDir returns false (not throwing)", async () => {
		const { readFile, writeFile, listDir, written } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"packages/pkg/package.json": { name: "@acme/pkg", version: "4.1.0" },
		});
		const report = await runNpmBumpVersions({
			version: "4.2.0",
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile,
			listDir: (p) => (p === PACKAGES_DIR ? ["pkg", "README.md"] : listDir(p)),
			isDir: (p) => !p.endsWith("README.md"),
		});
		expect(report.bumped).toEqual(["root", "packages/pkg"]);
		expect(JSON.parse(written[join(CWD, "packages/pkg/package.json")]!).version).toBe("4.2.0");
	});

	it("bumps apps/* with no workspace file, like packages/* and plugins/* (holocron#1233 regression)", async () => {
		const { readFile, writeFile, listDir, isDir, written } = makeFs({
			"package.json": { name: "root", version: "0.0.0", private: true },
			"apps/web/package.json": { name: "@acme/web", version: "4.1.0" },
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
		expect(report.bumped).toEqual(["root", "apps/web"]);
		expect(JSON.parse(written[join(CWD, "apps/web/package.json")]!).version).toBe("4.2.0");
	});

	it("bumps every package the workspace file declares: `<dir>/*` groups and literal package folders", async () => {
		const { readFile, writeFile, listDir, isDir, written } = makeFs({
			"pnpm-workspace.yaml":
				'packages:\n  - "clients/*"\n  - observability\n  - docs/theme\n  - "!clients/old"\n',
			"package.json": { name: "root", version: "0.0.0", private: true },
			"clients/http-client/package.json": { name: "@acme/http-client", version: "4.1.0" },
			"clients/old/package.json": { name: "@acme/old", version: "4.1.0" },
			"observability/package.json": { name: "@acme/observability", version: "4.1.0" },
			"docs/theme/package.json": { name: "@acme/docs-theme", version: "4.1.0" },
			"packages/ignored/package.json": { name: "@acme/ignored", version: "4.1.0" },
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
		expect(report.bumped).toEqual(["root", "clients/http-client", "observability", "docs/theme"]);
		expect(JSON.parse(written[join(CWD, "observability/package.json")]!).version).toBe("4.2.0");
		expect(written[join(CWD, "packages/ignored/package.json")]).toBeUndefined();
	});

	describe("with a version group", () => {
		const files = {
			"pnpm-workspace.yaml": 'packages:\n  - "clients/*"\n  - observability\n  - "utils/*"\n',
			"package.json": { name: "root", version: "0.0.0", private: true },
			"clients/http/package.json": { name: "@acme/http", version: "1.0.0" },
			"clients/internal/package.json": { name: "@acme/internal", version: "1.0.0", private: true },
			"observability/package.json": { name: "@acme/observability", version: "0.1.0" },
			"utils/array/package.json": { name: "@acme/array", version: "1.0.0" },
		};
		const bump = async (group: string, extra: Record<string, unknown> = {}) => {
			const { readFile, writeFile, listDir, isDir, written } = makeFs(files);
			const lines: string[] = [];
			const report = await runNpmBumpVersions({
				version: "2.0.0",
				cwd: CWD,
				group,
				print: (line) => lines.push(line),
				readFile,
				writeFile,
				listDir,
				isDir,
				...extra,
			});
			return { report, written, lines };
		};

		it("bumps only that group's non-private packages and leaves the root and other groups alone", async () => {
			const { report, written, lines } = await bump("clients");
			expect(report.bumped).toEqual(["clients/http"]);
			expect(report.skipped).toEqual(["clients/internal"]);
			expect(Object.keys(written)).toEqual([join(CWD, "clients/http/package.json")]);
			expect(lines[0]).toBe("Bumping group clients to 2.0.0…");
		});

		it("bumps a package that is its own folder", async () => {
			const { report, written } = await bump("observability");
			expect(report.bumped).toEqual(["observability"]);
			expect(JSON.parse(written[join(CWD, "observability/package.json")]!).version).toBe("2.0.0");
		});

		it("writes nothing on a dry run", async () => {
			const { report, written } = await bump("utils", { dryRun: true });
			expect(report.status).toBe("dry-run");
			expect(report.bumped).toEqual(["utils/array"]);
			expect(written).toEqual({});
		});

		it("moves the root and every other package when groups are excluded, leaving the excluded ones at their version", async () => {
			const { report, written, lines } = await bump("", {
				group: undefined,
				excludeGroups: ["observability", "utils"],
			});
			expect(report.bumped).toEqual(["root", "clients/http"]);
			expect(report.skipped).toEqual(["clients/internal"]);
			expect(written[join(CWD, "observability/package.json")]).toBeUndefined();
			expect(written[join(CWD, "utils/array/package.json")]).toBeUndefined();
			expect(JSON.parse(written[join(CWD, "package.json")]!).version).toBe("2.0.0");
			expect(lines[0]).toBe("Bumping monorepo, leaving out observability, utils, to 2.0.0…");
		});

		it("fails for a group that has no packages", async () => {
			const { report, written, lines } = await bump("skills");
			expect(report.status).toBe("fail");
			expect(report.message).toBe('no packages in group "skills"');
			expect(written).toEqual({});
			expect(lines).toContain('  ✗ no packages in group "skills"');
		});
	});
});
