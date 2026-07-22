import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import { createVercelClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const TOKEN = "vercel-pat";

describe("createVercelClient", () => {
	it("sends a bearer token on every request", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { projects: [] } }]);
		const client = createVercelClient({ token: TOKEN, fetch });
		await client.projects.list();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
		expect(calls[0]?.headers.accept).toBe("application/json");
	});

	it("appends teamId as a query param when configured", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { projects: [] } }]);
		const client = createVercelClient({ token: TOKEN, teamId: "team_xx", fetch });
		await client.projects.list();
		expect(calls[0]?.url).toBe("https://api.vercel.com/v10/projects?teamId=team_xx");
	});

	it("merges request-level query params with teamId", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { id: "e1", key: "X", target: [] } }]);
		const client = createVercelClient({ token: TOKEN, teamId: "team_xx", fetch });
		await client.env.set("abc", "production", "X", "v");
		expect(calls[0]?.url).toBe("https://api.vercel.com/v10/projects/abc/env?teamId=team_xx&upsert=true");
		expect(calls[0]?.body).toMatchObject({ key: "X", value: "v" });
		expect(calls[0]?.headers["content-type"]).toBe("application/json");
	});

	it("throws ProviderApiError with status + path on non-2xx", async () => {
		const { fetch } = stubFetch([{ status: 404, text: "project not found" }]);
		const client = createVercelClient({ token: TOKEN, fetch });
		const err = await client.projects.get("missing").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(404);
		expect((err as ProviderApiError).message).toContain("/v10/projects/missing");
	});

	it("wraps transport-level failures with status 0", async () => {
		const failingFetch: typeof fetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		const client = createVercelClient({ token: TOKEN, fetch: failingFetch });
		const err = await client.projects.list().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
		expect((err as ProviderApiError).message).toContain("Vercel GET /v10/projects failed");
	});
});
