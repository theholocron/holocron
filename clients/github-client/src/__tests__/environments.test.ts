import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

describe("environments", () => {
	it("GET /repos/{owner}/{name}/environments", async () => {
		const envs = [{ name: "staging" }, { name: "production" }];
		const { fetch, calls } = stubFetch([
			{ body: { total_count: 2, environments: envs } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.environments.listEnvironments(REPO);
		expect(calls[0]?.url).toContain("/environments");
		expect(result).toEqual(envs);
	});

	it("PUT /repos/{owner}/{name}/environments/{name}", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.environments.upsertEnvironment(REPO, "staging", {
			wait_timer: 0,
		});
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/environments/staging");
	});

	it("DELETE /repos/{owner}/{name}/environments/{name}", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.environments.deleteEnvironment(REPO, "staging");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/environments/staging");
	});
});
