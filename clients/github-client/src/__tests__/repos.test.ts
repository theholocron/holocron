import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

describe("repos", () => {
	it("GET /repos/{owner}/{name}", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { default_branch: "main", full_name: REPO } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.repos.getRepo(REPO);
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo");
		expect(calls[0]?.method).toBe("GET");
		expect(result.default_branch).toBe("main");
	});

	it("PATCH /repos/{owner}/{name} for updateRepo", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.repos.updateRepo(REPO, { allow_squash_merge: true });
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.body).toMatchObject({ allow_squash_merge: true });
	});

	it("GET /repos/{owner}/{name}/contents/{path}", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { content: "e30K", encoding: "base64" } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.repos.getContents(REPO, "holocron.config.json");
		expect(calls[0]?.url).toContain("/contents/holocron.config.json");
	});
});
