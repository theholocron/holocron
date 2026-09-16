import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "./helpers.js";

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

	it("accepts a string array value for multi_select properties", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.properties.setProperties(REPO, {
			holocron_capabilities: ["ci", "source", "deployment"],
		});
		expect(calls[0]?.body).toEqual({
			properties: [{ property_name: "holocron_capabilities", value: ["ci", "source", "deployment"] }],
		});
	});

	it("mixes string and string array values in the same call", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.properties.setProperties(REPO, {
			lifecycle: "active",
			holocron_capabilities: ["ci", "source"],
		});
		expect(calls[0]?.body).toEqual({
			properties: [
				{ property_name: "lifecycle", value: "active" },
				{ property_name: "holocron_capabilities", value: ["ci", "source"] },
			],
		});
	});
});
