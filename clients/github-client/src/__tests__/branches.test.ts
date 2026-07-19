import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

describe("branches", () => {
	it("PUT /repos/{owner}/{name}/branches/{branch}/protection", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const payload = { required_status_checks: null, enforce_admins: true };
		await client.branches.protectBranch(REPO, "main", payload);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain(
			"/repos/theholocron/test-repo/branches/main/protection",
		);
		expect(calls[0]?.body).toMatchObject(payload);
	});

	it("encodes branch names with special characters", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.branches.protectBranch(REPO, "feat/my-branch", {});
		expect(calls[0]?.url).toContain("feat%2Fmy-branch");
	});
});
