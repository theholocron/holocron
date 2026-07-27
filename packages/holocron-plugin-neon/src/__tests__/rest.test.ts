import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import { createNeonClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "neon-test-pat";

describe("createNeonClient", () => {
	it("sends bearer + accept headers on every request", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: {} }]);
		const client = createNeonClient({ token: TOKEN, fetch });
		await client.users.me();
		expect(calls[0]?.url).toBe("https://console.neon.tech/api/v2/users/me");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
		expect(calls[0]?.headers.accept).toBe("application/json");
	});

	it("serializes body on writes and sets content-type", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 201, body: { branch: { id: "br_new", name: "feat", created_at: "t" } } },
		]);
		const client = createNeonClient({ token: TOKEN, fetch });
		await client.branches.create("p1", { name: "feat", endpoints: [{ type: "read_write" }] });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toMatchObject({ branch: { name: "feat" } });
		expect(calls[0]?.headers["content-type"]).toBe("application/json");
	});

	it("throws ProviderApiError with status + path on non-2xx", async () => {
		const { fetch } = stubFetch([{ status: 403, text: "managed by vercel" }]);
		const client = createNeonClient({ token: TOKEN, fetch });
		const err = await client.branches.list("p1").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(403);
		expect((err as ProviderApiError).message).toContain("/projects/p1/branches");
	});

	it("wraps transport-level failures with status 0", async () => {
		const failingFetch: typeof fetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		const client = createNeonClient({ token: TOKEN, fetch: failingFetch });
		const err = await client.users.me().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
		expect((err as ProviderApiError).message).toContain("Neon GET /users/me failed");
	});
});
