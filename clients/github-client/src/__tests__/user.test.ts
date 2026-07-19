import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN } from "./helpers.js";

describe("user", () => {
	it("GET /user", async () => {
		const body = { login: "octocat", name: "Octocat", email: null };
		const { fetch, calls } = stubFetch([{ body }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.user.getCurrentUser();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/user");
		expect(result).toEqual(body);
	});
});
