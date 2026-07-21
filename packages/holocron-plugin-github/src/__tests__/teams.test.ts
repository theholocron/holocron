import { describe, expect, it } from "vitest";

import { syncTeams } from "../capabilities/teams.js";
import { createGitHubClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const REPO = "theholocron/holocron";

function makeRest(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createGitHubClient({ token: "pat", fetch });
	return { rest, calls };
}

describe("syncTeams", () => {
	it("PUTs each team with default push permission for string shorthand", async () => {
		const { rest, calls } = makeRest([{ status: 204 }, { status: 204 }]);

		const result = await syncTeams(rest, REPO, ["gatekeepers", "reviewers"]);

		expect(result).toBe("2 teams synced");
		expect(calls).toHaveLength(2);
		expect(calls[0]).toMatchObject({
			method: "PUT",
			url: expect.stringContaining("/orgs/theholocron/teams/gatekeepers/repos/theholocron/holocron"),
			body: { permission: "push" },
		});
		expect(calls[1]).toMatchObject({
			url: expect.stringContaining("/orgs/theholocron/teams/reviewers/repos/theholocron/holocron"),
			body: { permission: "push" },
		});
	});

	it("PUTs with the explicit permission when object form is used", async () => {
		const { rest, calls } = makeRest([{ status: 204 }]);

		await syncTeams(rest, REPO, [{ slug: "admins", permission: "maintain" }]);

		expect(calls[0]?.body).toEqual({ permission: "maintain" });
		expect(calls[0]?.url).toContain("/orgs/theholocron/teams/admins/repos/theholocron/holocron");
	});

	it("returns singular 'team synced' for a single entry", async () => {
		const { rest } = makeRest([{ status: 204 }]);
		const result = await syncTeams(rest, REPO, ["gatekeepers"]);
		expect(result).toBe("1 team synced");
	});

	it("returns '0 teams synced' for an empty list and makes no requests", async () => {
		const { rest, calls } = makeRest([]);
		const result = await syncTeams(rest, REPO, []);
		expect(result).toBe("0 teams synced");
		expect(calls).toHaveLength(0);
	});

	it("mixes string shorthand and object form", async () => {
		const { rest, calls } = makeRest([{ status: 204 }, { status: 204 }]);

		await syncTeams(rest, REPO, ["gatekeepers", { slug: "admins", permission: "admin" }]);

		expect(calls[0]?.body).toEqual({ permission: "push" });
		expect(calls[1]?.body).toEqual({ permission: "admin" });
	});

	it("extracts org/name from the repo coordinate", async () => {
		const { rest, calls } = makeRest([{ status: 204 }]);
		await syncTeams(rest, "acme/my-lib", ["gatekeepers"]);
		expect(calls[0]?.url).toContain("/orgs/acme/teams/gatekeepers/repos/acme/my-lib");
	});
});
