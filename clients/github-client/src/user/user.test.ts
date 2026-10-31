import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN } from "../test-helpers.js";
import { parseTokenExpiration } from "./user.js";

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

	it("GET /user with the token expiry from the response header", async () => {
		const body = { login: "octocat", name: null, email: null };
		const headers = { "github-authentication-token-expiration": "2026-11-19 03:46:04 UTC" };
		const { fetch } = stubFetch([{ body, headers }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.user.getCurrentUserWithExpiry()).toEqual({
			user: body,
			expiresAt: "2026-11-19T03:46:04.000Z",
		});
	});

	it("leaves expiresAt out for a token that does not expire", async () => {
		const body = { login: "octocat", name: null, email: null };
		const { fetch } = stubFetch([{ body }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.user.getCurrentUserWithExpiry()).toEqual({ user: body });
	});
});

describe("parseTokenExpiration", () => {
	it.each([
		["2026-11-19 03:46:04 UTC", "2026-11-19T03:46:04.000Z"],
		["2026-11-19T03:46:04Z", "2026-11-19T03:46:04.000Z"],
		["", undefined],
		[null, undefined],
		["soon", undefined],
	])("%s", (input, expected) => {
		expect(parseTokenExpiration(input)).toBe(expected);
	});
});
