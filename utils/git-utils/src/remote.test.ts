import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { parseGitRemoteUrl, readGitRemote } from "./remote.ts";

const gh = { host: "github.com", owner: "theholocron", repo: "holocron", slug: "theholocron/holocron" };

describe("parseGitRemoteUrl", () => {
	it.each([
		["https", "https://github.com/theholocron/holocron.git"],
		["https without .git", "https://github.com/theholocron/holocron"],
		["https with a trailing slash", "https://github.com/theholocron/holocron/"],
		["https with .git and a trailing slash", "https://github.com/theholocron/holocron.git/"],
		["https with credentials", "https://user:tok@github.com/theholocron/holocron.git"],
		["https with a port", "https://github.com:8443/theholocron/holocron.git"],
		["http", "http://github.com/theholocron/holocron.git"],
		["scp-style ssh", "git@github.com:theholocron/holocron.git"],
		["scp-style ssh without .git", "git@github.com:theholocron/holocron"],
		["scp-style without a user", "github.com:theholocron/holocron.git"],
		["ssh://", "ssh://git@github.com/theholocron/holocron.git"],
		["ssh:// with a port", "ssh://git@github.com:22/theholocron/holocron.git"],
		["git://", "git://github.com/theholocron/holocron.git"],
		["https with a query", "https://github.com/theholocron/holocron.git?ref=main"],
		["https with a fragment", "https://github.com/theholocron/holocron#readme"],
		["surrounding whitespace / newline", "  https://github.com/theholocron/holocron.git\n"],
	])("parses %s", (_label, url) => {
		expect(parseGitRemoteUrl(url)).toEqual(gh);
	});

	it.each([
		["https", "https://[2001:db8::1]/theholocron/holocron.git"],
		["https with a port", "https://[2001:db8::1]:8443/theholocron/holocron.git"],
		["ssh://", "ssh://git@[::1]:22/theholocron/holocron.git"],
		["scp-style", "git@[2001:db8::1]:theholocron/holocron.git"],
	])("parses a bracketed IPv6 host (%s), without the brackets", (_label, url) => {
		expect(parseGitRemoteUrl(url)).toMatchObject({ owner: "theholocron", repo: "holocron" });
		expect(parseGitRemoteUrl(url)?.host).toMatch(/^[0-9a-f:]+$/);
	});

	it.each([
		["trailing text", "https://github.com/theholocron/holocron.git extra stuff"],
		["a second URL", "https://github.com/a/b https://github.com/c/d"],
		["trailing text after a query", "https://github.com/a/b?x=1 junk"],
	])("rejects %s", (_label, url) => {
		expect(parseGitRemoteUrl(url)).toBeUndefined();
	});

	it("parses a long run of slashes in linear time, and rejects a lone .git segment", () => {
		const started = Date.now();
		expect(parseGitRemoteUrl(`https://github.com/a/b${"/".repeat(200_000)}`)).toMatchObject({ slug: "a/b" });
		expect(parseGitRemoteUrl(`https://github.com/a/b${"/".repeat(200_000)}x y`)).toBeUndefined();
		expect(Date.now() - started).toBeLessThan(1000);
		expect(parseGitRemoteUrl("https://github.com/owner/.git")).toBeUndefined();
	});

	it("works for any host, not just github.com", () => {
		expect(parseGitRemoteUrl("git@gitlab.example.com:team/app.git")).toEqual({
			host: "gitlab.example.com",
			owner: "team",
			repo: "app",
			slug: "team/app",
		});
		expect(parseGitRemoteUrl("git@gitserver:org/tool")?.host).toBe("gitserver");
	});

	it("keeps nested groups in the owner", () => {
		expect(parseGitRemoteUrl("https://gitlab.com/group/sub/app.git")).toEqual({
			host: "gitlab.com",
			owner: "group/sub",
			repo: "app",
			slug: "group/sub/app",
		});
	});

	it("keeps a dot inside the repo name and only strips a final .git", () => {
		expect(parseGitRemoteUrl("https://github.com/o/my.repo.git")?.repo).toBe("my.repo");
		expect(parseGitRemoteUrl("https://github.com/o/repo.github.io")?.repo).toBe("repo.github.io");
	});

	it.each([
		["empty", ""],
		["whitespace", "   "],
		["a local path", "/Users/me/code/repo"],
		["a relative path", "../repo"],
		["a windows path", "C:\\code\\repo"],
		["a windows drive path with slashes", "C:/code/repo"],
		["a url with no path", "https://github.com"],
		["a url with one path segment", "https://github.com/onlyone"],
		["scp-style with one segment", "git@github.com:onlyone"],
		["garbage", "not a url"],
	])("returns undefined for %s", (_label, url) => {
		expect(parseGitRemoteUrl(url)).toBeUndefined();
	});
});

describe("importing the module", () => {
	it("does not load node:child_process until the default exec is used", async () => {
		vi.resetModules();
		vi.doMock("node:child_process", () => {
			throw new Error("node:child_process must not be loaded at import time");
		});
		try {
			const mod = await import("./remote.ts");
			expect(mod.parseGitRemoteUrl("git@github.com:a/b.git")?.slug).toBe("a/b");
			// with an injected exec the default is never reached either
			expect(await mod.readGitRemote("/x", { exec: async () => "https://github.com/a/b" })).toMatchObject({
				repo: "b",
			});
		} finally {
			vi.doUnmock("node:child_process");
			vi.resetModules();
		}
	});
});

describe("readGitRemote", () => {
	it("runs `git remote get-url origin` in the given directory and parses the output", async () => {
		const exec = vi.fn().mockResolvedValue("git@github.com:theholocron/holocron.git\n");
		expect(await readGitRemote("/repo", { exec })).toEqual(gh);
		expect(exec).toHaveBeenCalledWith(["remote", "get-url", "origin"], { cwd: "/repo" });
	});

	it("asks for another remote by name", async () => {
		const exec = vi.fn().mockResolvedValue("https://github.com/a/b.git");
		await readGitRemote("/repo", { exec, remote: "upstream" });
		expect(exec).toHaveBeenCalledWith(["remote", "get-url", "upstream"], { cwd: "/repo" });
	});

	it("is undefined when git fails (not a repo, no such remote, git missing)", async () => {
		const exec = vi.fn().mockRejectedValue(new Error("fatal: No such remote 'origin'"));
		expect(await readGitRemote("/repo", { exec })).toBeUndefined();
	});

	it("is undefined when the URL isn't one it understands", async () => {
		const exec = vi.fn().mockResolvedValue("/some/local/path\n");
		expect(await readGitRemote("/repo", { exec })).toBeUndefined();
	});

	it("reads a real repository with the default exec", async () => {
		const dir = await mkdtemp(join(tmpdir(), "git-utils-"));
		try {
			execFileSync("git", ["init", "-q"], { cwd: dir });
			execFileSync("git", ["remote", "add", "origin", "https://github.com/theholocron/holocron.git"], {
				cwd: dir,
			});
			expect(await readGitRemote(dir)).toEqual(gh);
			expect(await readGitRemote(dir, { remote: "nope" })).toBeUndefined();
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("is undefined outside a repository with the default exec", async () => {
		const dir = await mkdtemp(join(tmpdir(), "git-utils-norepo-"));
		try {
			expect(await readGitRemote(dir)).toBeUndefined();
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
