import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

describe("topics", () => {
	it("PUT /repos/{owner}/{name}/topics", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.topics.setTopics(REPO, ["cli", "nodejs", "typescript"]);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/topics");
		expect(calls[0]?.body).toEqual({
			names: ["cli", "nodejs", "typescript"],
		});
	});
});
