import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "../test-helpers.js";

describe("branches", () => {
	it("PUT /repos/{owner}/{name}/branches/{branch}/protection", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const payload = { required_status_checks: null, enforce_admins: true };
		await client.branches.protectBranch(REPO, "main", payload);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/branches/main/protection");
		expect(calls[0]?.body).toMatchObject(payload);
	});

	it("encodes branch names with special characters", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.branches.protectBranch(REPO, "feat/my-branch", {});
		expect(calls[0]?.url).toContain("feat%2Fmy-branch");
	});

	it("lists branches with their commit, a page at a time", async () => {
		const full = Array.from({ length: 100 }, (_, n) => ({ name: `b${n}`, commit: { sha: `s${n}` } }));
		const { fetch, calls } = stubFetch([{ body: full }, { body: [{ name: "last", commit: { sha: "z" } }] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const all = await client.branches.listBranches(REPO);
		expect(all).toHaveLength(101);
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/branches?per_page=100&page=1");
		expect(calls[1]?.url).toContain("page=2");
	});

	it("stops listing at the page limit", async () => {
		const full = Array.from({ length: 100 }, (_, n) => ({ name: `b${n}`, commit: { sha: `s${n}` } }));
		const { fetch, calls } = stubFetch(Array.from({ length: 101 }, () => ({ body: full })));
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.branches.listBranches(REPO)).toHaveLength(10_000);
		expect(calls).toHaveLength(100);
	});

	it("DELETEs the branch's ref, keeping the slashes in its name", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.branches.removeBranch(REPO, "feat/my branch");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/git/refs/heads/feat/my%20branch");
	});
});
