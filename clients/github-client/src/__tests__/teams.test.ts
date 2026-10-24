import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "./helpers.js";

const [ORG, REPO_NAME] = REPO.split("/") as [string, string];

describe("teams", () => {
	it("PUT /orgs/{org}/teams/{slug}/repos/{owner}/{repo} with permission", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.teams.addRepo(ORG, "gatekeepers", ORG, REPO_NAME, "push");
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain(`/orgs/${ORG}/teams/gatekeepers/repos/${ORG}/${REPO_NAME}`);
		expect(calls[0]?.body).toEqual({ permission: "push" });
	});

	it("passes the specified permission verbatim", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.teams.addRepo(ORG, "admins", ORG, REPO_NAME, "maintain");
		expect(calls[0]?.body).toEqual({ permission: "maintain" });
	});

	it("members: GET one page of a short team", async () => {
		const { fetch, calls } = stubFetch([{ body: [{ id: 1, login: "luke" }] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.teams.members(ORG, "gatekeepers")).toEqual([{ id: 1, login: "luke" }]);
		expect(calls[0]?.url).toContain(`/orgs/${ORG}/teams/gatekeepers/members?per_page=100&page=1`);
	});

	it("members: follows pages until a short one", async () => {
		const full = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, login: `u${i}` }));
		const { fetch, calls } = stubFetch([{ body: full }, { body: [{ id: 500, login: "last" }] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const all = await client.teams.members(ORG, "gatekeepers");
		expect(all).toHaveLength(101);
		expect(new URL(calls[1]!.url).searchParams.get("page")).toBe("2");
	});

	it("members: a team of exactly 5000 is returned whole", async () => {
		const full = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, login: `u${i}` }));
		const { fetch, calls } = stubFetch([...Array.from({ length: 50 }, () => ({ body: full })), { body: [] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.teams.members(ORG, "gatekeepers")).toHaveLength(5000);
		expect(new URL(calls[50]!.url).searchParams.get("page")).toBe("51");
	});

	it("members: names that would reroute the request are refused or encoded", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await expect(client.teams.members(ORG, "..")).rejects.toThrow(/invalid path segment/);
		await expect(client.teams.members("", "x")).rejects.toThrow(/invalid path segment/);
		await client.teams.members(ORG, "a/b?c");
		expect(calls[0]?.url).toContain("/teams/a%2Fb%3Fc/members");
	});

	it("members: refuses to read without end", async () => {
		const full = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, login: `u${i}` }));
		const { fetch } = stubFetch(Array.from({ length: 51 }, () => ({ body: full })));
		const client = createGitHubClient({ token: TOKEN, fetch });
		await expect(client.teams.members(ORG, "gatekeepers")).rejects.toThrow(/refusing to read/);
	});
});
