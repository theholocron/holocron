import { describe, expect, it } from "vitest";

import { createPostHogClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "phx_test-personal-api-key";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createPostHogClient({ token: TOKEN, fetch });
	return { client, calls };
}

describe("createPostHogClient", () => {
	it("sends Bearer authorization header", async () => {
		const { client, calls } = makeClient([
			{ body: { email: "x@x.com", organization: { id: "1", slug: "acme", name: "Acme" } } },
		]);
		await client.users.me();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("targets the PostHog US cloud base URL by default", async () => {
		const { client, calls } = makeClient([
			{ body: { email: "x@x.com", organization: { id: "1", slug: "acme", name: "Acme" } } },
		]);
		await client.users.me();
		expect(calls[0]?.url).toContain("https://app.posthog.com");
	});

	it("respects host override", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { email: "x@x.com", organization: { id: "1", slug: "acme", name: "Acme" } } },
		]);
		const client = createPostHogClient({ token: TOKEN, host: "https://eu.posthog.com", fetch });
		await client.users.me();
		expect(calls[0]?.url).toContain("https://eu.posthog.com");
	});

	it("respects baseUrl override (takes precedence over host)", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { email: "x@x.com", organization: { id: "1", slug: "acme", name: "Acme" } } },
		]);
		const client = createPostHogClient({
			token: TOKEN,
			host: "https://eu.posthog.com",
			baseUrl: "https://posthog.test",
			fetch,
		});
		await client.users.me();
		expect(calls[0]?.url).toContain("https://posthog.test");
	});
});

describe("users.me", () => {
	it("GET /api/users/@me/", async () => {
		const user = { email: "dev@acme.com", organization: { id: "org_1", slug: "acme", name: "Acme Inc" } };
		const { client, calls } = makeClient([{ body: user }]);
		const result = await client.users.me();
		expect(calls[0]?.url).toContain("/api/users/@me/");
		expect(calls[0]?.method).toBe("GET");
		expect(result.email).toBe("dev@acme.com");
		expect(result.organization.slug).toBe("acme");
	});
});

describe("projects.list", () => {
	it("GET /api/projects/", async () => {
		const { client, calls } = makeClient([{ body: { results: [] } }]);
		const result = await client.projects.list();
		expect(calls[0]?.url).toContain("/api/projects/");
		expect(calls[0]?.method).toBe("GET");
		expect(result.results).toEqual([]);
	});

	it("returns project list with api_token", async () => {
		const projects = [{ id: 1, name: "My App", api_token: "phc_abc123" }];
		const { client } = makeClient([{ body: { results: projects } }]);
		const result = await client.projects.list();
		expect(result.results[0]?.api_token).toBe("phc_abc123");
	});
});

describe("projects.create", () => {
	it("POST /api/projects/ with name in body", async () => {
		const created = { id: 2, name: "New Project", api_token: "phc_new456" };
		const { client, calls } = makeClient([{ status: 201, body: created }]);
		const result = await client.projects.create({ name: "New Project" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/api/projects/");
		expect(calls[0]?.body).toEqual({ name: "New Project" });
		expect(result.api_token).toBe("phc_new456");
	});
});

describe("error handling", () => {
	it("throws ProviderApiError on non-2xx response from users.me", async () => {
		const { fetch } = stubFetch([
			{ status: 401, body: { detail: "Authentication credentials were not provided." } },
		]);
		const client = createPostHogClient({ token: "bad", fetch });
		const err = await client.users.me().catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
	});

	it("throws ProviderApiError on non-2xx response from projects.list", async () => {
		const { fetch } = stubFetch([{ status: 403, body: { detail: "You do not have permission." } }]);
		const client = createPostHogClient({ token: "bad", fetch });
		const err = await client.projects.list().catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
	});
});
