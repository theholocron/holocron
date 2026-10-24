import { ProviderApiError } from "@theholocron/http-client";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "./helpers.js";

describe("git", () => {
	it("GET /repos/{owner}/{name}/git/ref/heads/{branch}", async () => {
		const { fetch, calls } = stubFetch([{ body: { ref: "refs/heads/main", object: { sha: "abc123" } } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.git.getRef(REPO, "main");
		expect(calls[0]?.url).toContain("/git/ref/heads/main");
		expect(result.object.sha).toBe("abc123");
	});

	it("GET /repos/{owner}/{name}/git/commits/{sha}", async () => {
		const { fetch, calls } = stubFetch([{ body: { sha: "abc123", tree: { sha: "tree123" } } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.git.getCommit(REPO, "abc123");
		expect(calls[0]?.url).toContain("/git/commits/abc123");
		expect(result.tree.sha).toBe("tree123");
	});

	it("GET /repos/{owner}/{name}/git/trees/{sha}?recursive=1", async () => {
		const { fetch, calls } = stubFetch([{ body: { sha: "tree123", tree: [], truncated: false } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.getTree(REPO, "tree123", true);
		expect(calls[0]?.url).toContain("?recursive=1");
	});

	it("GET /repos/{owner}/{name}/contents/{path}", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { content: "aGVsbG8=", encoding: "base64", sha: "file123", name: "README.md", path: "README.md" } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.git.getContents(REPO, "README.md");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/contents/README.md");
		expect(calls[0]?.url).not.toContain("?ref=");
		expect(result.sha).toBe("file123");
	});

	it("GET /repos/{owner}/{name}/contents/{path}?ref={ref} when a ref is given", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { content: "aGVsbG8=", encoding: "base64", sha: "file123", name: "README.md", path: "README.md" } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.getContents(REPO, "README.md", "pr-head-sha");
		expect(calls[0]?.url).toContain("/contents/README.md");
		expect(calls[0]?.url).toContain("ref=pr-head-sha");
	});

	it("POST /repos/{owner}/{name}/git/blobs", async () => {
		const { fetch, calls } = stubFetch([{ body: { sha: "blob123", url: "" } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.git.createBlob(REPO, "hello world");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/git/blobs");
		expect(calls[0]?.body).toMatchObject({
			content: "hello world",
			encoding: "utf-8",
		});
		expect(result.sha).toBe("blob123");
	});

	it("POST /repos/{owner}/{name}/git/trees", async () => {
		const entry = {
			path: ".github/workflows/lint.yml",
			mode: "100644",
			type: "blob",
			sha: "blob123",
		};
		const { fetch, calls } = stubFetch([{ body: { sha: "newtree", tree: [entry], truncated: false } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.createTree(REPO, [entry], "basetree");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toMatchObject({
			base_tree: "basetree",
			tree: [entry],
		});
	});

	it("POST /repos/{owner}/{name}/git/commits", async () => {
		const { fetch, calls } = stubFetch([{ body: { sha: "newcommit", tree: { sha: "tree" } } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.createCommit(REPO, "chore: sync", "newtree", ["parentsha"]);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/git/commits");
		expect(calls[0]?.body).toMatchObject({
			message: "chore: sync",
			tree: "newtree",
			parents: ["parentsha"],
		});
	});

	it("POST /repos/{owner}/{name}/git/refs", async () => {
		const { fetch, calls } = stubFetch([{ body: { ref: "refs/heads/sync", object: { sha: "newcommit" } } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.createRef(REPO, "refs/heads/sync", "newcommit");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toMatchObject({
			ref: "refs/heads/sync",
			sha: "newcommit",
		});
	});

	it("PATCH /repos/{owner}/{name}/git/refs/{ref}", async () => {
		const { fetch, calls } = stubFetch([{ body: { ref: "refs/heads/sync", object: { sha: "newcommit" } } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.updateRef(REPO, "heads/sync", "newcommit", true);
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/git/refs/heads/sync");
		expect(calls[0]?.body).toMatchObject({ sha: "newcommit", force: true });
	});

	it("POST /repos/{owner}/{name}/pulls", async () => {
		const { fetch, calls } = stubFetch([
			{
				body: {
					number: 1,
					html_url: "https://github.com/pr/1",
					title: "chore: sync",
				},
			},
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.git.createPull(REPO, {
			title: "chore: sync",
			head: "sync",
			base: "main",
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/pulls");
		expect(result.html_url).toBe("https://github.com/pr/1");
	});
});

describe("git.putContents", () => {
	it("PUT /contents/:path with base64 text, the sha and the branch", async () => {
		const { fetch, calls } = stubFetch([{ body: { content: { sha: "n", path: "a.json" }, commit: { sha: "c" } } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const out = await client.git.putContents(REPO, "a.json", {
			message: "m",
			content: "héllo",
			sha: "old",
			branch: "b",
		});
		expect(out.content.sha).toBe("n");
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain(`/repos/${REPO}/contents/a.json`);
		expect(calls[0]?.body).toEqual({
			message: "m",
			content: Buffer.from("héllo").toString("base64"),
			sha: "old",
			branch: "b",
		});
	});

	it("leaves sha and branch out when creating a file", async () => {
		const { fetch, calls } = stubFetch([{ body: { content: { sha: "n", path: "a.json" }, commit: { sha: "c" } } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.putContents(REPO, "a.json", { message: "m", content: "x" });
		expect(calls[0]?.body).toEqual({ message: "m", content: "eA==" });
	});

	it("a stale sha is refused by GitHub and comes through as a ProviderApiError", async () => {
		const { fetch } = stubFetch([{ status: 409, body: { message: "does not match" } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const err = await client.git
			.putContents(REPO, "a.json", { message: "m", content: "x", sha: "stale" })
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect(err).toMatchObject({ status: 409 });
	});

	it("encodes each path segment and refuses ones that climb out", async () => {
		const { fetch, calls } = stubFetch([{ body: { content: { sha: "n", path: "p" }, commit: { sha: "c" } } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.putContents(REPO, "dir/a b?c#d.json", { message: "m", content: "x" });
		expect(calls[0]?.url).toContain("/contents/dir/a%20b%3Fc%23d.json");
		expect(() => client.git.putContents(REPO, "../other/x", { message: "m", content: "x" })).toThrow(
			/invalid path segment/
		);
	});

	it("encodes non-ASCII text without Buffer", async () => {
		const { fetch, calls } = stubFetch([{ body: { content: { sha: "n", path: "p" }, commit: { sha: "c" } } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.putContents(REPO, "a.json", { message: "m", content: "héllo ✓" });
		expect(Buffer.from((calls[0]!.body as { content: string }).content, "base64").toString("utf-8")).toBe(
			"héllo ✓"
		);
	});
});
