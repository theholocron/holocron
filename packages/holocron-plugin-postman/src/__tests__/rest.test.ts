import { ProviderApiError } from "@theholocron/cli";
import { PostmanPlanLimitError } from "@theholocron/postman-client";
import { describe, expect, it, vi } from "vitest";

import { createPostmanClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const TOKEN = "PMAK-xxx";

describe("createPostmanClient", () => {
	it("sends x-api-key + accept headers on every request", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { user: { id: 1 } } }]);
		const client = createPostmanClient({ token: TOKEN, fetch });
		await client.me.get();
		expect(calls[0]?.url).toBe("https://api.getpostman.com/me");
		expect(calls[0]?.headers["x-api-key"]).toBe(TOKEN);
		expect(calls[0]?.headers.accept).toBe("application/json");
	});

	it("serializes body on writes and sets content-type", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { environments: [] } }]);
		const client = createPostmanClient({ token: TOKEN, fetch });
		await client.environments.create("ws1", { name: "prod", values: [] });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.headers["content-type"]).toBe("application/json");
	});

	it("appends query params when supplied", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { workspaces: [] } }]);
		const client = createPostmanClient({ token: TOKEN, fetch });
		await client.workspaces.list();
		expect(calls[0]?.url).toBe("https://api.getpostman.com/workspaces");
	});

	it("throws ProviderApiError with status + path on non-2xx", async () => {
		const { fetch } = stubFetch([{ status: 403, text: "AuthorizationError" }]);
		const client = createPostmanClient({ token: TOKEN, fetch });
		const err = await client.me.get().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(403);
		expect((err as ProviderApiError).message).toContain("/me");
	});

	it("wraps transport-level failures with status 0", async () => {
		const failingFetch: typeof fetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		const client = createPostmanClient({ token: TOKEN, fetch: failingFetch });
		const err = await client.me.get().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
		expect((err as ProviderApiError).message).toContain("Postman GET /me failed");
	});

	it("wraps limitReachedError as PostmanPlanLimitError", async () => {
		const { fetch } = stubFetch([
			{
				status: 403,
				text: JSON.stringify({ error: { name: "limitReachedError", message: "upgrade required" } }),
			},
		]);
		const client = createPostmanClient({ token: TOKEN, fetch });
		const err = await client.specs.list("ws1").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(PostmanPlanLimitError);
		expect((err as PostmanPlanLimitError).message).toBe("upgrade required");
	});
});
