import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runUpgradeNode } from "../commands/upgrade-node.js";

const CWD = "/repo";

// Build injectable fs + walkFiles from a flat file map.
// Keys are paths relative to CWD; values are raw file contents.
function makeFs(files: Record<string, string>) {
	const written: Record<string, string> = {};

	const abs = (p: string) => (p.startsWith(CWD + "/") ? p : join(CWD, p));
	const rel = (p: string) => (p.startsWith(CWD + "/") ? p.slice(CWD.length + 1) : p);

	const readFile = (p: string): string => {
		const content = files[rel(abs(p))];
		if (content === undefined) throw new Error(`ENOENT: ${p}`);
		return content;
	};

	const writeFile = (p: string, c: string) => {
		written[rel(abs(p))] = c;
	};

	// walkFiles returns absolute paths for every file in the map
	const walkFiles = (_dir: string): string[] => Object.keys(files).map((k) => join(CWD, k));

	return { readFile, writeFile, walkFiles, written };
}

// Shorthand: build a package.json string
function pkg(fields: Record<string, unknown> = {}): string {
	return JSON.stringify({ name: "@acme/root", version: "1.0.0", ...fields }, null, 2) + "\n";
}

// ── auto-detection of --from ──────────────────────────────────────────────────

describe("auto-detect from", () => {
	it("reads from .nvmrc when --from is omitted", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			".nvmrc": "20\n",
			"package.json": pkg(),
		});
		await runUpgradeNode({ to: 22, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written[".nvmrc"]).toBe("22\n");
	});

	it("reads from engines.node when .nvmrc is absent", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"package.json": pkg({ engines: { node: ">=20.0.0" } }),
		});
		await runUpgradeNode({ to: 22, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(JSON.parse(written["package.json"]!).engines.node).toBe(">=22.0.0");
	});

	it("fails when version cannot be detected and --from is not passed", async () => {
		const { readFile, writeFile, walkFiles } = makeFs({
			"package.json": pkg(),
		});
		const report = await runUpgradeNode({ to: 22, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/--from/);
	});

	it("no-ops when from === to", async () => {
		const lines: string[] = [];
		const { readFile, writeFile, walkFiles } = makeFs({
			".nvmrc": "22\n",
			"package.json": pkg({ engines: { node: ">=22.0.0" } }),
		});
		const report = await runUpgradeNode({
			to: 22,
			cwd: CWD,
			print: (l) => lines.push(l),
			readFile,
			writeFile,
			walkFiles,
		});
		expect(report.status).toBe("ok");
		expect(report.updated).toHaveLength(0);
		expect(lines.some((l) => l.includes("nothing to do"))).toBe(true);
	});
});

// ── package.json ──────────────────────────────────────────────────────────────

describe("package.json", () => {
	it("updates engines.node", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"package.json": pkg({ engines: { node: ">=20.0.0" } }),
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(JSON.parse(written["package.json"]!).engines.node).toBe(">=22.0.0");
	});

	it("updates @types/node in devDependencies", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"package.json": pkg({ devDependencies: { "@types/node": "^20.0.0" } }),
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(JSON.parse(written["package.json"]!).devDependencies["@types/node"]).toBe("^22.0.0");
	});

	it("updates @types/node in dependencies", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"package.json": pkg({ dependencies: { "@types/node": "^20.0.0" } }),
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(JSON.parse(written["package.json"]!).dependencies["@types/node"]).toBe("^22.0.0");
	});

	it("leaves catalog: pins untouched", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"package.json": pkg({
				engines: { node: ">=20.0.0" },
				devDependencies: { "@types/node": "catalog:" },
			}),
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		// engines.node updated, catalog pin untouched
		expect(JSON.parse(written["package.json"]!).devDependencies["@types/node"]).toBe("catalog:");
	});

	it("does not write when nothing in the file matches", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"package.json": pkg({ engines: { node: ">=18.0.0" } }),
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		// engines.node is >=18, not >=20 — no match, no write
		expect(written["package.json"]).toBeUndefined();
	});

	it("handles packages in nested directories", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"package.json": pkg(),
			"packages/foo/package.json": pkg({ name: "@acme/foo", engines: { node: ">=20.0.0" } }),
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(JSON.parse(written["packages/foo/package.json"]!).engines.node).toBe(">=22.0.0");
	});
});

// ── .nvmrc / .node-version ────────────────────────────────────────────────────

describe(".nvmrc", () => {
	it("updates major-only content", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({ ".nvmrc": "20\n" });
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written[".nvmrc"]).toBe("22\n");
	});

	it("updates full-version content", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({ ".nvmrc": "20.11.0\n" });
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written[".nvmrc"]).toBe("22\n");
	});

	it("does not write when major does not match", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({ ".nvmrc": "18\n" });
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written[".nvmrc"]).toBeUndefined();
	});
});

describe(".node-version", () => {
	it("updates major-only content", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({ ".node-version": "20\n" });
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written[".node-version"]).toBe("22\n");
	});
});

// ── GitHub Actions YAML ───────────────────────────────────────────────────────

describe("GitHub Actions YAML", () => {
	it("updates bare node-version", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			".github/workflows/ci.yml": "with:\n  node-version: 20\n",
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written[".github/workflows/ci.yml"]).toContain("node-version: 22");
	});

	it("updates single-quoted node-version, preserving quotes", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			".github/workflows/ci.yml": "with:\n  node-version: '20'\n",
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written[".github/workflows/ci.yml"]).toContain("node-version: '22'");
	});

	it("does not touch other numeric values in the same file", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			".github/workflows/ci.yml": "timeout-minutes: 20\nwith:\n  node-version: 20\n",
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		// timeout-minutes is not node-version — should remain 20
		expect(written[".github/workflows/ci.yml"]).toContain("timeout-minutes: 20");
		expect(written[".github/workflows/ci.yml"]).toContain("node-version: 22");
	});

	it("does not write when no node-version pin matches", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			".github/workflows/ci.yml": "with:\n  node-version: 18\n",
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written[".github/workflows/ci.yml"]).toBeUndefined();
	});
});

// ── Dockerfile ────────────────────────────────────────────────────────────────

describe("Dockerfile", () => {
	it("updates FROM node:<major>", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			Dockerfile: "FROM node:20\nRUN npm install\n",
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written["Dockerfile"]).toContain("FROM node:22");
	});

	it("updates FROM node:<major>-<tag>", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			Dockerfile: "FROM node:20-alpine\n",
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written["Dockerfile"]).toContain("FROM node:22-alpine");
	});

	it("matches Dockerfile.<variant> filenames", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"Dockerfile.dev": "FROM node:20\n",
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written["Dockerfile.dev"]).toContain("FROM node:22");
	});
});

// ── .tool-versions ────────────────────────────────────────────────────────────

describe(".tool-versions", () => {
	it("updates nodejs <major>", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			".tool-versions": "nodejs 20\npython 3.11\n",
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written[".tool-versions"]).toContain("nodejs 22");
		expect(written[".tool-versions"]).toContain("python 3.11");
	});

	it("updates nodejs <major>.<minor>.<patch>", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			".tool-versions": "nodejs 20.11.0\n",
		});
		await runUpgradeNode({ to: 22, from: 20, cwd: CWD, print: () => {}, readFile, writeFile, walkFiles });
		expect(written[".tool-versions"]).toContain("nodejs 22");
	});
});

// ── extra paths ───────────────────────────────────────────────────────────────

describe("extra paths", () => {
	it("applies patterns to extra paths not found by the walker", async () => {
		const { readFile, writeFile, written } = makeFs({
			"infra/Dockerfile": "FROM node:20\n",
		});
		const limitedWalk = () => [] as string[];
		await runUpgradeNode({
			to: 22,
			from: 20,
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile,
			walkFiles: limitedWalk,
			extra: ["infra/Dockerfile"],
		});
		expect(written["infra/Dockerfile"]).toContain("FROM node:22");
	});
});

// ── dry-run ───────────────────────────────────────────────────────────────────

describe("error resilience", () => {
	it("skips package.json files with invalid JSON", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			".nvmrc": "20\n",
			"package.json": "{ invalid json }",
		});
		const report = await runUpgradeNode({
			to: 22,
			from: 20,
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile,
			walkFiles,
		});
		expect(report.status).toBe("ok");
		expect(written["package.json"]).toBeUndefined();
	});

	it("skips files that cannot be read", async () => {
		const { writeFile, walkFiles } = makeFs({
			".nvmrc": "20\n",
			"package.json": "{}",
			"unreadable.yml": "node-version: 20",
		});
		const readFile = (p: string): string => {
			if (p.endsWith("unreadable.yml")) throw new Error("EACCES: permission denied");
			if (p.endsWith(".nvmrc")) return "20\n";
			if (p.endsWith("package.json")) return "{}";
			throw new Error(`ENOENT: ${p}`);
		};
		const report = await runUpgradeNode({
			to: 22,
			from: 20,
			cwd: CWD,
			print: () => {},
			readFile,
			writeFile,
			walkFiles,
		});
		expect(report.status).toBe("ok");
	});
});

describe("dry-run", () => {
	it("does not write any files", async () => {
		const { readFile, writeFile, walkFiles, written } = makeFs({
			".nvmrc": "20\n",
			"package.json": pkg({ engines: { node: ">=20.0.0" } }),
			".github/workflows/ci.yml": "with:\n  node-version: 20\n",
		});
		const report = await runUpgradeNode({
			to: 22,
			from: 20,
			cwd: CWD,
			dryRun: true,
			print: () => {},
			readFile,
			writeFile,
			walkFiles,
		});
		expect(report.status).toBe("dry-run");
		expect(Object.keys(written)).toHaveLength(0);
	});

	it("still reports what would be updated", async () => {
		const lines: string[] = [];
		const { readFile, writeFile, walkFiles } = makeFs({
			".nvmrc": "20\n",
			"package.json": pkg({ engines: { node: ">=20.0.0" } }),
		});
		const report = await runUpgradeNode({
			to: 22,
			from: 20,
			cwd: CWD,
			dryRun: true,
			print: (l) => lines.push(l),
			readFile,
			writeFile,
			walkFiles,
		});
		expect(report.updated.length).toBeGreaterThan(0);
		expect(lines.some((l) => l.includes("~"))).toBe(true);
		expect(lines.some((l) => l.includes("dry-run"))).toBe(true);
	});
});
