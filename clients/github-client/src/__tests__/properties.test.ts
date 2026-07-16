import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

describe("properties", () => {
	it("PATCH /repos/{owner}/{name}/properties/values", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.properties.setProperties(REPO, {
			lifecycle: "active",
			monorepo: "false",
		});
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/properties/values");
		expect(calls[0]?.body).toEqual({
			properties: [
				{ property_name: "lifecycle", value: "active" },
				{ property_name: "monorepo", value: "false" },
			],
		});
	});
});
