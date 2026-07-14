import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import { createNeonRestClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const TOKEN = "neon-pat";

describe("NeonRestClient", () => {
	it("sends bearer + accept headers on every request", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { projects: [] } }]);
		const client = createNeonRestClient({ token: TOKEN, fetch });
		await client.request("/projects");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
		expect(calls[0]?.headers.accept).toBe("application/json");
	});

	it("serializes body on writes and sets content-type", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { branch: {} } }]);
		const client = createNeonRestClient({ token: TOKEN, fetch });
		await client.request("/projects/p1/branches", {
			method: "POST",
			body: { branch: { name: "feat" } },
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toEqual({ branch: { name: "feat" } });
		expect(calls[0]?.headers["content-type"]).toBe("application/json");
	});

	it("appends query params when supplied", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { uri: "..." } }]);
		const client = createNeonRestClient({ token: TOKEN, fetch });
		await client.request("/projects/p1/connection_uri", {
			query: { branch_id: "br-1", pooled: "true" },
		});
		expect(calls[0]?.url).toBe(
			"https://console.neon.tech/api/v2/projects/p1/connection_uri?branch_id=br-1&pooled=true"
		);
	});

	it("returns undefined on 204", async () => {
		const { fetch } = stubFetch([{ status: 204 }]);
		const client = createNeonRestClient({ token: TOKEN, fetch });
		expect(await client.request("/projects/p1/branches/b1", { method: "DELETE" })).toBeUndefined();
	});

	it("throws ProviderApiError with status + path on non-2xx", async () => {
		const { fetch } = stubFetch([{ status: 403, text: "managed by vercel" }]);
		const client = createNeonRestClient({ token: TOKEN, fetch });
		const err = await client.request("/projects", { method: "POST", body: {} }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		const pae = err as ProviderApiError;
		expect(pae.status).toBe(403);
		expect(pae.message).toContain("/projects");
	});

	it("wraps transport-level failures with status 0", async () => {
		const failingFetch: typeof fetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		const client = createNeonRestClient({ token: TOKEN, fetch: failingFetch });
		const err = await client.request("/projects").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
		expect((err as ProviderApiError).message).toContain("Neon GET /projects failed");
	});
});
