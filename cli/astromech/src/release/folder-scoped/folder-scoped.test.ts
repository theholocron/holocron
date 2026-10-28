import { describe, expect, it, vi } from "vitest";

import type { ReleaseContext } from "../release.type.js";
import { folderScoped, ungroupedScoped } from "./folder-scoped.js";

const commit = (hash: string, message = hash) => ({ hash, message });

const FILES = new Map([
	["a", ["clients/a.ts"]],
	["b", ["utils/b.ts"]],
	["c", ["README.md", "clients/c.ts"]],
]);

function setup(step: "analyzeCommits" | "generateNotes" = "analyzeCommits") {
	const inner = vi.fn(() => "minor");
	const load = vi.fn(async () => ({ [step]: inner }));
	const listFiles = vi.fn(() => FILES);
	const plugin = folderScoped(step, ["clients"], { load, listFiles });
	return { inner, load, listFiles, plugin };
}

describe("folderScoped", () => {
	it("passes only the commits that touched the paths to the stock plugin, with its config and the rest of the context", async () => {
		const { inner, plugin } = setup();
		const context: ReleaseContext = {
			cwd: "/repo",
			commits: [commit("a"), commit("b"), commit("c")],
			lastRelease: { x: 1 },
		};
		const result = await plugin.analyzeCommits!({ preset: "conventionalcommits" }, context);

		expect(result).toBe("minor");
		expect(inner).toHaveBeenCalledWith(
			{ preset: "conventionalcommits" },
			expect.objectContaining({ cwd: "/repo", lastRelease: { x: 1 }, commits: [commit("a"), commit("c")] })
		);
	});

	it("lists the files in the context's working directory, once, for every commit", async () => {
		const { listFiles, plugin } = setup();
		await plugin.analyzeCommits!({}, { cwd: "/repo", commits: [commit("a"), commit("b")] });
		expect(listFiles).toHaveBeenCalledTimes(1);
		expect(listFiles).toHaveBeenCalledWith("/repo", ["a", "b"]);
	});

	it("hands the stock plugin no commits when none touched the paths", async () => {
		const { inner, plugin } = setup();
		await plugin.analyzeCommits!({}, { cwd: "/repo", commits: [commit("b")] });
		expect(inner).toHaveBeenCalledWith({}, expect.objectContaining({ commits: [] }));
	});

	it("treats a commit git reports nothing for as outside the paths", async () => {
		const { inner, plugin } = setup();
		await plugin.analyzeCommits!({}, { cwd: "/repo", commits: [commit("unknown")] });
		expect(inner).toHaveBeenCalledWith({}, expect.objectContaining({ commits: [] }));
	});

	it("works with no commits in the context", async () => {
		const { inner, plugin } = setup();
		await plugin.analyzeCommits!({}, { cwd: "/repo" });
		expect(inner).toHaveBeenCalledWith({}, expect.objectContaining({ commits: [] }));
	});

	it("wraps generateNotes of the release-notes generator the same way", async () => {
		const { inner, load, plugin } = setup("generateNotes");
		await plugin.generateNotes!({}, { cwd: "/repo", commits: [commit("a"), commit("b")] });
		expect(load).toHaveBeenCalledWith("@semantic-release/release-notes-generator");
		expect(inner).toHaveBeenCalledWith({}, expect.objectContaining({ commits: [commit("a")] }));
	});

	it("loads the commit analyzer for analyzeCommits", async () => {
		const { load, plugin } = setup();
		await plugin.analyzeCommits!({}, { cwd: "/repo", commits: [] });
		expect(load).toHaveBeenCalledWith("@semantic-release/commit-analyzer");
	});

	it("exposes only the one step", () => {
		expect(Object.keys(setup().plugin)).toEqual(["analyzeCommits"]);
	});

	it("falls back to the process working directory and a real `import()` when nothing is injected", async () => {
		const plugin = folderScoped("analyzeCommits", ["clients"]);
		// no commits, so git is never asked; the stock analyzer is imported for real and finds no release
		const logger = { log: () => {} };
		await expect(plugin.analyzeCommits!({}, { commits: [], logger })).resolves.toBeNull();
	});
});

describe("ungroupedScoped", () => {
	const FILES_UNGROUPED = new Map([
		["a", ["observability/src/a.ts"]],
		["b", ["cli/cli/src/b.ts"]],
		["c", ["observability/src/c.ts", "package.json"]],
		["d", ["skills/d.md"]],
	]);

	function setup(step: "analyzeCommits" | "generateNotes" = "analyzeCommits") {
		const inner = vi.fn(() => "patch");
		const load = vi.fn(async () => ({ [step]: inner }));
		const plugin = ungroupedScoped(step, ["observability", "skills"], { load, listFiles: () => FILES_UNGROUPED });
		return { inner, load, plugin };
	}

	it("keeps only commits that changed something outside every group folder", async () => {
		const { inner, plugin } = setup();
		await plugin.analyzeCommits!(
			{ preset: "x" },
			{ cwd: "/repo", commits: [commit("a"), commit("b"), commit("c"), commit("d")] }
		);
		expect(inner).toHaveBeenCalledWith(
			{ preset: "x" },
			expect.objectContaining({ commits: [commit("b"), commit("c")] })
		);
	});

	it("hands the stock plugin no commits when every commit is inside a group", async () => {
		const { inner, plugin } = setup();
		await plugin.analyzeCommits!({}, { cwd: "/repo", commits: [commit("a"), commit("d")] });
		expect(inner).toHaveBeenCalledWith({}, expect.objectContaining({ commits: [] }));
	});

	it("wraps generateNotes the same way, loading the notes generator", async () => {
		const { inner, load, plugin } = setup("generateNotes");
		await plugin.generateNotes!({}, { cwd: "/repo", commits: [commit("a"), commit("b")] });
		expect(load).toHaveBeenCalledWith("@semantic-release/release-notes-generator");
		expect(inner).toHaveBeenCalledWith({}, expect.objectContaining({ commits: [commit("b")] }));
	});

	it("treats a commit git reports nothing for as inside no group, so it is kept out of the way", async () => {
		const { inner, plugin } = setup();
		await plugin.analyzeCommits!({}, { cwd: "/repo", commits: [commit("unknown")] });
		expect(inner).toHaveBeenCalledWith({}, expect.objectContaining({ commits: [] }));
	});
});
