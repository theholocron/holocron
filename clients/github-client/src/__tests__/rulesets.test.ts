import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

const RULESET = {
	id: 1,
	name: "holocron-default-branch",
	enforcement: "active",
};

describe("rulesets", () => {
	it("GET /repos/{owner}/{name}/rulesets", async () => {
		const { fetch, calls } = stubFetch([{ body: [RULESET] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.rulesets.listRulesets(REPO);
		expect(calls[0]?.url).toContain("/rulesets");
		expect(result).toEqual([RULESET]);
	});

	it("POST /repos/{owner}/{name}/rulesets", async () => {
		const payload = {
			name: "holocron-default-branch",
			enforcement: "active",
		};
		const { fetch, calls } = stubFetch([{ body: { ...payload, id: 2 } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.rulesets.createRuleset(REPO, payload);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toMatchObject(payload);
	});

	it("PUT /repos/{owner}/{name}/rulesets/{id}", async () => {
		const { fetch, calls } = stubFetch([{ body: RULESET }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.rulesets.updateRuleset(REPO, 1, {
			enforcement: "evaluate",
		});
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/rulesets/1");
	});
});
