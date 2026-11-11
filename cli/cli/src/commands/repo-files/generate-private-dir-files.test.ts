import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { generatePrivateDirFiles } from "./generate-private-dir-files.js";
import { generateRepoFiles } from "./generate-repo-files.js";

let root: string;

function loadedFrom(): LoadedConfig {
	return {
		resolved: resolveConfig({ name: "x", providers: {} } as Parameters<typeof resolveConfig>[0]),
		filepath: join(root, "holocron.config.json"),
	};
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "private-dir-files-"));
	mkdirSync(join(root, ".git"));
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("generatePrivateDirFiles", () => {
	it("makes an empty tracked .gitkeep and the ignore block, and the same bytes every time", async () => {
		const input = { loaded: loadedFrom(), repoRoot: root };
		const first = await generatePrivateDirFiles(input);
		expect(first.map((f) => f.path)).toEqual([".holocron/.private/.gitkeep", ".gitignore"]);
		expect(first[0]!.content).toBe("");
		expect(first[1]!.content).toBe(
			"# managed by holocron setup — private directory\n.holocron/.private/*\n!.holocron/.private/.gitkeep\n# end managed by holocron setup — private directory\n"
		);
		expect(await generatePrivateDirFiles(input)).toEqual(first);
	});

	it("merges into the .gitignore on disk and is stable once written", async () => {
		writeFileSync(join(root, ".gitignore"), "node_modules\n");
		const input = { loaded: loadedFrom(), repoRoot: root };
		const [, ignore] = await generatePrivateDirFiles(input);
		expect(ignore!.content).toMatch(/^node_modules\n\n# managed by holocron setup — private directory\n/);
		writeFileSync(join(root, ".gitignore"), ignore!.content);
		expect((await generatePrivateDirFiles(input))[1]!.content).toBe(ignore!.content);
	});

	it("is part of generateRepoFiles, so setup, sync and the generated check share it", async () => {
		const entries = await generateRepoFiles({ loaded: loadedFrom(), repoRoot: root });
		const paths = entries.flatMap((e) => (e.kind === "file" ? [e.path] : []));
		expect(paths).toContain(".holocron/.private/.gitkeep");
		expect(paths).toContain(".gitignore");
	});

	it("leaves nothing for Prettier to change: it has no parser for either file", async () => {
		const { getFileInfo } = await import("prettier");
		for (const path of [".gitignore", ".holocron/.private/.gitkeep"]) {
			expect((await getFileInfo(join(root, path))).inferredParser).toBeNull();
		}
	});

	it("is the rule git applies: everything in the directory is ignored but .gitkeep", () => {
		const repo = mkdtempSync(join(tmpdir(), "private-dir-git-"));
		try {
			execFileSync("git", ["init", "-q"], { cwd: repo });
			writeFileSync(join(repo, ".gitignore"), ".holocron/.private/*\n!.holocron/.private/.gitkeep\n");
			mkdirSync(join(repo, ".holocron/.private"), { recursive: true });
			const ignored = (path: string) => {
				try {
					execFileSync("git", ["check-ignore", "-q", path], { cwd: repo });
					return true;
				} catch {
					return false;
				}
			};
			expect(ignored(".holocron/.private/.credentials")).toBe(true);
			expect(ignored(".holocron/.private/other.env")).toBe(true);
			expect(ignored(".holocron/.private/.gitkeep")).toBe(false);
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});
});
