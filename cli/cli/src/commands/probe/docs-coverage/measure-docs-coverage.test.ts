import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { measureDocsCoverage } from "./measure-docs-coverage.js";

describe("measureDocsCoverage", () => {
	it("runs TypeDoc per package and sorts by directory", () => {
		const typedoc = vi.fn((entry: string) => ({
			children: [{ name: entry, kind: 64, signatures: [{ comment: { summary: [{}] } }] }],
		}));
		const out = measureDocsCoverage({
			repoRoot: "/repo",
			typedoc,
			packages: [
				{ name: "@s/b", dir: "b", entry: "/repo/b/src/index.ts", tsconfig: "/repo/b/tsconfig.json" },
				{ name: "@s/a", dir: "a", entry: "/repo/a/index.ts" },
			],
		});
		expect(out.map((p) => p.dir)).toEqual(["a", "b"]);
		expect(typedoc).toHaveBeenCalledWith("/repo/b/src/index.ts", "/repo/b/tsconfig.json");
		expect(typedoc).toHaveBeenCalledWith("/repo/a/index.ts", undefined);
		expect(out[0]!.symbols).toEqual([
			{ kind: "Function", name: "/repo/a/index.ts", file: "a/src/index.ts", line: 1, documented: true },
		]);
	});

	it("measures a package's subpath exports with its root entry, and counts a shared symbol once", () => {
		const symbol = (name: string, file: string, line: number) => ({
			name,
			kind: 64,
			sources: [{ fileName: file, line }],
			signatures: [{ comment: { summary: [{}] } }],
		});
		const typedoc = vi.fn((entry: string) => ({
			children:
				entry === "/repo/p/src/index.ts"
					? [symbol("root", "p/src/index.ts", 3), symbol("shared", "p/src/shared.ts", 1)]
					: [symbol("sub", "p/src/sub.ts", 2), symbol("shared", "p/src/shared.ts", 1)],
		}));

		const out = measureDocsCoverage({
			repoRoot: "/repo",
			typedoc,
			packages: [{ name: "@s/p", dir: "p", entry: "/repo/p/src/index.ts", also: ["/repo/p/src/sub.ts"] }],
		});

		expect(typedoc).toHaveBeenCalledTimes(2);
		expect(out[0]!.symbols.map((s) => s.name)).toEqual(["root", "shared", "sub"]);
	});

	it("finds a workspace package's subpath exports from its manifest, and never the root entry twice", () => {
		const root = mkdtempSync(join(tmpdir(), "docs-cov-"));
		writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "libs/*"\n');
		mkdirSync(join(root, "libs", "multi", "src", "config"), { recursive: true });
		writeFileSync(
			join(root, "libs", "multi", "package.json"),
			JSON.stringify({
				name: "@s/multi",
				exports: {
					".": { import: "./dist/index.mjs" },
					"./config": { import: "./dist/config/index.mjs" },
					"./same": { import: "./dist/index.mjs" },
					"./package.json": "./package.json",
				},
			})
		);
		for (const f of ["src/index.ts", "src/config/index.ts"]) writeFileSync(join(root, "libs", "multi", f), "");
		const typedoc = vi.fn(() => ({ children: [] }));

		measureDocsCoverage({ repoRoot: root, typedoc });

		const entries = typedoc.mock.calls.map((c) => (c as unknown as [string])[0]);
		expect(entries).toEqual([join(root, "libs/multi/src/index.ts"), join(root, "libs/multi/src/config/index.ts")]);
	});

	it("finds the public workspace packages that have an entry point", () => {
		const root = mkdtempSync(join(tmpdir(), "docs-cov-"));
		writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "libs/*"\n');
		const pkg = (dir: string, manifest: object, files: string[]) => {
			mkdirSync(join(root, "libs", dir, "src"), { recursive: true });
			writeFileSync(join(root, "libs", dir, "package.json"), JSON.stringify(manifest));
			for (const f of files) writeFileSync(join(root, "libs", dir, f), "");
		};
		pkg("src-entry", { name: "@s/src-entry" }, ["src/index.ts", "tsconfig.json"]);
		pkg("flat", { name: "@s/flat" }, ["index.ts"]);
		pkg("private", { name: "@s/private", private: true }, ["src/index.ts"]);
		pkg("no-entry", { name: "@s/no-entry" }, []);
		const typedoc = vi.fn(() => ({ children: [] }));
		const out = measureDocsCoverage({ repoRoot: root, typedoc });
		expect(out.map((p) => p.name)).toEqual(["@s/flat", "@s/src-entry"]);
		expect(typedoc).toHaveBeenCalledWith(
			join(root, "libs/src-entry/src/index.ts"),
			join(root, "libs/src-entry/tsconfig.json")
		);
		expect(typedoc).toHaveBeenCalledWith(join(root, "libs/flat/index.ts"), undefined);
	});
});
