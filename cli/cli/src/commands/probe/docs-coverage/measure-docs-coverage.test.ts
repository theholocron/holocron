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
