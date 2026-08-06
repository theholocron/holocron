import { afterEach, describe, expect, it, vi } from "vitest";

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

	it("reports partial success when one team slug returns 404", async () => {
		const { rest } = makeRest([{ status: 204 }, { status: 404, body: { message: "Not Found" } }]);
		const result = await syncTeams(rest, REPO, ["gatekeepers", "bad-slug"]);
		expect(result).toBe("1 synced, failed: bad-slug");
	});

	it("throws when all teams fail", async () => {
		const { rest } = makeRest([{ status: 404, body: { message: "Not Found" } }]);
		await expect(syncTeams(rest, REPO, ["bad-slug"])).rejects.toThrow("all teams failed: bad-slug");
	});

	describe("classic token fallback", () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("falls back to classic token fetch on 403 and succeeds", async () => {
			const { rest } = makeRest([{ status: 403, body: { message: "Resource not accessible by personal access token" } }]);
			const globalFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
			vi.stubGlobal("fetch", globalFetch);

			const result = await syncTeams(rest, REPO, ["gatekeepers"], "classic_pat");

			expect(result).toBe("1 team synced");
			expect(globalFetch).toHaveBeenCalledOnce();
			const [url, init] = globalFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toContain("/orgs/theholocron/teams/gatekeepers/repos/theholocron/holocron");
			expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer classic_pat");
		});

		it("propagates classic token fetch failure when fallback also fails", async () => {
			const { rest } = makeRest([{ status: 403, body: { message: "Resource not accessible by personal access token" } }]);
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 })));

			await expect(syncTeams(rest, REPO, ["gatekeepers"], "classic_pat")).rejects.toThrow("all teams failed: gatekeepers");
		});

		it("propagates the original 403 when no classic token is provided", async () => {
			const { rest } = makeRest([{ status: 403, body: { message: "Resource not accessible by personal access token" } }]);

			await expect(syncTeams(rest, REPO, ["gatekeepers"])).rejects.toThrow("all teams failed: gatekeepers");
		});

		it("propagates non-403 errors without attempting fallback", async () => {
			const { rest } = makeRest([{ status: 422, body: { message: "Validation Failed" } }]);
			const globalFetch = vi.fn();
			vi.stubGlobal("fetch", globalFetch);

			await expect(syncTeams(rest, REPO, ["gatekeepers"], "classic_pat")).rejects.toThrow();
			expect(globalFetch).not.toHaveBeenCalled();
		});
	});
});
