import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "../test-helpers.js";

const variable = (name: string, value = "v") => ({ name, value });
const many = (count: number, from = 0) => Array.from({ length: count }, (_, i) => variable(`V${from + i}`));

describe("variables", () => {
	it("lists repo variables with their values", async () => {
		const { fetch, calls } = stubFetch([
			{
				body: {
					total_count: 1,
					variables: [variable("TURBO_TEAM", "iamnewton")],
				},
			},
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.variables.listVariables(REPO, { kind: "repo" })).toEqual([
			variable("TURBO_TEAM", "iamnewton"),
		]);
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/actions/variables");
		expect(calls[0]?.url).toContain("per_page=30");
	});

	it("lists environment and organization variables from their own paths", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { total_count: 0, variables: [] } },
			{ body: { total_count: 0, variables: [] } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.variables.listVariables(REPO, {
			kind: "environment",
			name: "staging",
		});
		await client.variables.listVariables(REPO, {
			kind: "organization",
			org: "theholocron",
		});
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/environments/staging/variables");
		expect(calls[1]?.url).toContain("/orgs/theholocron/actions/variables");
	});

	it("reads every page, 30 at a time, and stops at the total", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { total_count: 35, variables: many(30) } },
			{ body: { total_count: 35, variables: many(5, 30) } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const all = await client.variables.listVariables(REPO, {
			kind: "repo",
		});
		expect(all).toEqual([...many(30), ...many(5, 30)]);
		expect(calls).toHaveLength(2);
		expect(calls[1]?.url).toContain("page=2");
	});

	it("does not ask for another page when the total is reached on a full page", async () => {
		const { fetch, calls } = stubFetch([{ body: { total_count: 30, variables: many(30) } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.variables.listVariables(REPO, { kind: "repo" })).toHaveLength(30);
		expect(calls).toHaveLength(1);
	});

	it("refuses to read a runaway listing", async () => {
		const page = { body: { total_count: 1_000_000, variables: many(30) } };
		const { fetch } = stubFetch(Array.from({ length: 100 }, () => page));
		const client = createGitHubClient({ token: TOKEN, fetch });
		await expect(client.variables.listVariables(REPO, { kind: "repo" })).rejects.toThrow(
			/refusing to read them all/
		);
	});

	it("gets one variable, or null when it does not exist", async () => {
		const { fetch, calls } = stubFetch([
			{ body: variable("TURBO_TEAM", "iamnewton") },
			{ status: 404, body: { message: "Not Found" } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.variables.getVariable(REPO, { kind: "repo" }, "TURBO_TEAM")).toEqual(
			variable("TURBO_TEAM", "iamnewton")
		);
		expect(calls[0]?.url).toContain("/actions/variables/TURBO_TEAM");
		expect(await client.variables.getVariable(REPO, { kind: "repo" }, "NOPE")).toBeNull();
	});

	it("passes any other failure on from getVariable", async () => {
		const { fetch } = stubFetch([{ status: 403, body: { message: "Forbidden" } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await expect(client.variables.getVariable(REPO, { kind: "repo" }, "X")).rejects.toThrow();
	});

	it("creates, updates and deletes", async () => {
		const { fetch, calls } = stubFetch([{ status: 201 }, { status: 204 }, { status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const scope = { kind: "organization", org: "theholocron" } as const;
		await client.variables.createVariable(REPO, scope, {
			name: "A",
			value: "1",
			visibility: "all",
		});
		await client.variables.updateVariable(REPO, scope, "A", { value: "2" });
		await client.variables.deleteVariable(REPO, scope, "A");
		expect(calls.map((c) => [c.method, new URL(c.url).pathname])).toEqual([
			["POST", "/orgs/theholocron/actions/variables"],
			["PATCH", "/orgs/theholocron/actions/variables/A"],
			["DELETE", "/orgs/theholocron/actions/variables/A"],
		]);
		expect(calls[0]?.body).toEqual({
			name: "A",
			value: "1",
			visibility: "all",
		});
		// GitHub's update takes the name with the value, so it is always sent.
		expect(calls[1]?.body).toEqual({ name: "A", value: "2" });
	});

	it("refuses a repository that is not exactly owner/name", async () => {
		const { fetch, calls } = stubFetch([]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		for (const repo of ["../other/repo", "a/b/c", "a", "owner/.."]) {
			await expect(client.variables.listVariables(repo, { kind: "repo" })).rejects.toThrow(
				/invalid (repository|path segment)/
			);
		}
		expect(calls).toHaveLength(0);
	});

	it("refuses a name that would climb out of the path", async () => {
		const { fetch } = stubFetch([]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await expect(client.variables.deleteVariable(REPO, { kind: "repo" }, "..")).rejects.toThrow(
			/invalid path segment/
		);
	});
});
