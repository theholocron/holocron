import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import { createClerkClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "sk_test_pat";

describe("createClerkClient", () => {
	it("sends bearer + accept headers on every request", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { total_count: 0 } }]);
		const client = createClerkClient({ token: TOKEN, fetch });
		await client.users.count();
		expect(calls[0]?.url).toBe("https://api.clerk.com/v1/users/count");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
		expect(calls[0]?.headers.accept).toBe("application/json");
	});

	it("serializes body on writes and sets content-type", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 200, body: { id: "user_x", email_addresses: [], object: "user" } },
		]);
		const client = createClerkClient({ token: TOKEN, fetch });
		await client.users.create({ email_address: ["x@y.com"] });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toMatchObject({ email_address: ["x@y.com"] });
		expect(calls[0]?.headers["content-type"]).toBe("application/json");
	});

	it("throws ProviderApiError with status + path on non-2xx", async () => {
		const { fetch } = stubFetch([{ status: 401, text: "invalid secret key" }]);
		const client = createClerkClient({ token: TOKEN, fetch });
		const err = await client.users.count().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		const pae = err as ProviderApiError;
		expect(pae.status).toBe(401);
		expect(pae.message).toContain("/users/count");
	});

	it("wraps transport-level failures with status 0", async () => {
		const failingFetch: typeof fetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		const client = createClerkClient({ token: TOKEN, fetch: failingFetch });
		const err = await client.users.count().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
		expect((err as ProviderApiError).message).toContain("Clerk GET /users/count failed");
	});
});
