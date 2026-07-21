import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

const [ORG, REPO_NAME] = REPO.split("/") as [string, string];

describe("teams", () => {
	it("PUT /orgs/{org}/teams/{slug}/repos/{owner}/{repo} with permission", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.teams.addRepo(ORG, "gatekeepers", ORG, REPO_NAME, "push");
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain(
			`/orgs/${ORG}/teams/gatekeepers/repos/${ORG}/${REPO_NAME}`,
		);
		expect(calls[0]?.body).toEqual({ permission: "push" });
	});

	it("passes the specified permission verbatim", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.teams.addRepo(ORG, "admins", ORG, REPO_NAME, "maintain");
		expect(calls[0]?.body).toEqual({ permission: "maintain" });
	});
});
