import { describe, expect, it } from "vitest";

import { syncProperties } from "../capabilities/properties.js";
import { createGitHubClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const REPO = "theholocron/holocron";

function makeRest(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createGitHubClient({ token: "pat", fetch });
	return { rest, calls };
}

describe("syncProperties", () => {
	it("PATCHes /repos/{owner}/{name}/properties/values with mapped entries", async () => {
		const { rest, calls } = makeRest([{ status: 204, body: null }]);

		const result = await syncProperties(rest, REPO, {
			branch_protection_level: "strict",
			lifecycle: "active",
			monorepo: "false",
		});

		expect(result).toBe("3 properties set");
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			method: "PATCH",
			url: expect.stringContaining("/repos/theholocron/holocron/properties/values"),
			body: {
				properties: expect.arrayContaining([
					{ property_name: "branch_protection_level", value: "strict" },
					{ property_name: "lifecycle", value: "active" },
					{ property_name: "monorepo", value: "false" },
				]),
			},
		});
	});

	it("returns '0 properties set' for an empty values map", async () => {
		const { rest, calls } = makeRest([{ status: 204, body: null }]);

		const result = await syncProperties(rest, REPO, {});

		expect(result).toBe("0 properties set");
		expect(calls[0]?.body).toMatchObject({ properties: [] });
	});

	it("uses owner/name from the repo coordinate", async () => {
		const { rest, calls } = makeRest([{ status: 204, body: null }]);

		await syncProperties(rest, "acme/my-lib", { open_source: "true" });

		expect(calls[0]?.url).toContain("/repos/acme/my-lib/properties/values");
	});
});
