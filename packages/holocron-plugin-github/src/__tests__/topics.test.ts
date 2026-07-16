import { describe, expect, it } from "vitest";

import { syncTopics } from "../capabilities/topics.js";
import { createGitHubRestClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const REPO = "theholocron/holocron";

function makeRest(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createGitHubRestClient({ token: "pat", fetch });
	return { rest, calls };
}

describe("syncTopics", () => {
	it("PUTs /repos/{owner}/{name}/topics with names array", async () => {
		const { rest, calls } = makeRest([{ status: 200, body: { names: ["cli", "nodejs"] } }]);

		const result = await syncTopics(rest, REPO, ["cli", "nodejs"]);

		expect(result).toBe("2 topics set");
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			method: "PUT",
			url: expect.stringContaining("/repos/theholocron/holocron/topics"),
			body: { names: ["cli", "nodejs"] },
		});
	});

	it("returns '0 topics set' for an empty list", async () => {
		const { rest, calls } = makeRest([{ status: 200, body: { names: [] } }]);

		const result = await syncTopics(rest, REPO, []);

		expect(result).toBe("0 topics set");
		expect(calls[0]?.body).toMatchObject({ names: [] });
	});

	it("uses owner/name from the repo coordinate", async () => {
		const { rest, calls } = makeRest([{ status: 200, body: { names: ["cli"] } }]);

		await syncTopics(rest, "acme/my-lib", ["cli"]);

		expect(calls[0]?.url).toContain("/repos/acme/my-lib/topics");
	});
});
