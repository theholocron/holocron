import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const TOKEN = "gh_pat_test";

describe("GitHubClient HTTP plumbing", () => {
	it("sends the bearer token and api-version headers on GET", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { login: "iamnewton", name: null, email: null } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.user.getCurrentUser();
		expect(result.login).toBe("iamnewton");
		expect(calls[0]?.url).toBe("https://api.github.com/user");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
		expect(calls[0]?.headers["x-github-api-version"]).toBe("2022-11-28");
		expect(calls[0]?.headers.accept).toBe("application/vnd.github+json");
	});

	it("serializes a body on POST and sets content-type", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 201, body: { name: "bug", color: "d73a4a", description: null } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.labels.createLabel("x/y", { name: "bug", color: "d73a4a", description: "A bug" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toMatchObject({ name: "bug", color: "d73a4a" });
		expect(calls[0]?.headers["content-type"]).toBe("application/json");
	});

	it("returns undefined for 204 responses", async () => {
		const { fetch } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.security.enableVulnerabilityAlerts("x/y");
		expect(result).toBeUndefined();
	});

	it("throws ProviderApiError on non-2xx with status + details", async () => {
		const { fetch } = stubFetch([{ status: 401, text: "bad creds" }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const err = await client.user.getCurrentUser().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		const pae = err as ProviderApiError;
		expect(pae.status).toBe(401);
		expect(pae.details).toBe("bad creds");
		expect(pae.message).toContain("401");
	});

	it("strips trailing slashes from baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { login: "x", name: null, email: null } }]);
		const client = createGitHubClient({ token: TOKEN, fetch, baseUrl: "https://example.test/api/" });
		await client.user.getCurrentUser();
		expect(calls[0]?.url).toBe("https://example.test/api/user");
	});
});
