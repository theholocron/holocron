import { describe, expect, it, vi } from "vitest";

import { parseTagList, type RealReleasesDeps, realReleasesIo } from "./real-releases-io.js";

describe("parseTagList", () => {
	it("reads the tag and its time", () => {
		expect(parseTagList("v1.0.0 1700000000\nconfigs-v2.0.0-alpha.1 1700000100\n")).toEqual([
			{ name: "v1.0.0", createdAt: 1700000000 },
			{ name: "configs-v2.0.0-alpha.1", createdAt: 1700000100 },
		]);
	});

	it("keeps a tag whose time is missing, and skips blank lines", () => {
		expect(parseTagList("\nv1.0.0\n")).toEqual([{ name: "v1.0.0" }]);
	});
});

describe("realReleasesIo", () => {
	const reply = (status: number, body: unknown = {}) => ({ status, ok: status < 300, json: async () => body });
	const deps = (over: Partial<RealReleasesDeps> = {}): RealReleasesDeps => ({
		spawn: () => ({ status: 0, stdout: "v1.0.0 1700000000\n", stderr: "" }),
		fetch: async () => reply(200, { latest: "1.0.0" }),
		discover: () => ["@x/a"],
		nowMs: () => 1_700_000_000_500,
		...over,
	});

	it("lists tags from git, run in the repo", () => {
		const spawn = vi.fn(() => ({ status: 0, stdout: "v1.0.0 1700000000\n", stderr: "" }));
		expect(realReleasesIo("/repo", deps({ spawn })).tags()).toEqual([{ name: "v1.0.0", createdAt: 1700000000 }]);
		expect(spawn).toHaveBeenCalledWith("git", expect.arrayContaining(["for-each-ref", "refs/tags"]), {
			cwd: "/repo",
			encoding: "utf8",
		});
	});

	it("throws git's message when it fails", () => {
		const spawn = () => ({ status: 128, stdout: "", stderr: "not a git repository\n" });
		expect(() => realReleasesIo("/repo", deps({ spawn })).tags()).toThrow("not a git repository");
	});

	it("lists the packages the workspace discovers for a scope", () => {
		const discover = vi.fn(() => ["@x/a", "@x/b"]);
		expect(realReleasesIo("/repo", deps({ discover })).packages({ group: "configs" })).toEqual(["@x/a", "@x/b"]);
		expect(discover).toHaveBeenCalledWith("/repo", { group: "configs" });
	});

	it("reads dist-tags from the registry, escaping the scope's slash", async () => {
		const fetch = vi.fn(async (_url: string) => reply(200, { latest: "1.0.0" }));
		expect(await realReleasesIo("/repo", deps({ fetch })).distTags("@theholocron/cli")).toEqual({
			latest: "1.0.0",
		});
		expect(fetch).toHaveBeenCalledWith("https://registry.npmjs.org/-/package/@theholocron%2fcli/dist-tags");
	});

	it("treats 404 and 401 as not on npm, and any other failure as an error", async () => {
		const io = (status: number) => realReleasesIo("/repo", deps({ fetch: async () => reply(status) }));
		expect(await io(404).distTags("x")).toBeUndefined();
		expect(await io(401).distTags("@x/y")).toBeUndefined();
		await expect(io(503).distTags("x")).rejects.toThrow("npm answered 503 for x");
	});

	it("reports the time in seconds", () => {
		expect(realReleasesIo("/repo", deps()).now()).toBe(1_700_000_000);
	});

	it("uses the global fetch by default", async () => {
		const fetchStub = vi.fn(async () => reply(200, { latest: "2.0.0" }));
		vi.stubGlobal("fetch", fetchStub);
		try {
			expect(await realReleasesIo("/repo").distTags("pkg")).toEqual({ latest: "2.0.0" });
		} finally {
			vi.unstubAllGlobals();
		}
		expect(fetchStub).toHaveBeenCalledWith("https://registry.npmjs.org/-/package/pkg/dist-tags");
	});

	it("uses the real git, network and workspace by default", () => {
		const io = realReleasesIo(process.cwd());
		expect(typeof io.now()).toBe("number");
		expect(io.tags().length).toBeGreaterThanOrEqual(0);
		expect(Array.isArray(io.packages({ group: "no-such-group" }))).toBe(true);
	});
});
