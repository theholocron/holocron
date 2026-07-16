import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

describe("git", () => {
	it("GET /repos/{owner}/{name}/git/ref/heads/{branch}", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { ref: "refs/heads/main", object: { sha: "abc123" } } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.git.getRef(REPO, "main");
		expect(calls[0]?.url).toContain("/git/ref/heads/main");
		expect(result.object.sha).toBe("abc123");
	});

	it("GET /repos/{owner}/{name}/git/commits/{sha}", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { sha: "abc123", tree: { sha: "tree123" } } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.git.getCommit(REPO, "abc123");
		expect(calls[0]?.url).toContain("/git/commits/abc123");
		expect(result.tree.sha).toBe("tree123");
	});

	it("GET /repos/{owner}/{name}/git/trees/{sha}?recursive=1", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { sha: "tree123", tree: [], truncated: false } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.getTree(REPO, "tree123", true);
		expect(calls[0]?.url).toContain("?recursive=1");
	});

	it("POST /repos/{owner}/{name}/git/blobs", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { sha: "blob123", url: "" } },
		]);
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
		const { fetch, calls } = stubFetch([
			{ body: { sha: "newtree", tree: [entry], truncated: false } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.createTree(REPO, [entry], "basetree");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toMatchObject({
			base_tree: "basetree",
			tree: [entry],
		});
	});

	it("POST /repos/{owner}/{name}/git/commits", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { sha: "newcommit", tree: { sha: "tree" } } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.createCommit(REPO, "chore: sync", "newtree", [
			"parentsha",
		]);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/git/commits");
		expect(calls[0]?.body).toMatchObject({
			message: "chore: sync",
			tree: "newtree",
			parents: ["parentsha"],
		});
	});

	it("POST /repos/{owner}/{name}/git/refs", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { ref: "refs/heads/sync", object: { sha: "newcommit" } } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.git.createRef(REPO, "refs/heads/sync", "newcommit");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toMatchObject({
			ref: "refs/heads/sync",
			sha: "newcommit",
		});
	});

	it("PATCH /repos/{owner}/{name}/git/refs/{ref}", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { ref: "refs/heads/sync", object: { sha: "newcommit" } } },
		]);
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
