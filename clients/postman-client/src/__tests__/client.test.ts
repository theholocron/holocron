import { describe, expect, it } from "vitest";
import { createPostmanClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "postman-test-key";

describe("createPostmanClient", () => {
	it("sends x-api-key header (not Authorization)", async () => {
		const { fetch, calls } = stubFetch([{ body: { user: {} } }]);
		const client = createPostmanClient({ token: TOKEN, fetch });
		await client.me.get();
		expect(calls[0]?.headers["x-api-key"]).toBe(TOKEN);
		expect(calls[0]?.headers.authorization).toBeUndefined();
	});

	it("targets the Postman base URL", async () => {
		const { fetch, calls } = stubFetch([{ body: { user: {} } }]);
		const client = createPostmanClient({ token: TOKEN, fetch });
		await client.me.get();
		expect(calls[0]?.url).toContain("https://api.getpostman.com");
	});

	it("respects baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ body: { user: {} } }]);
		const client = createPostmanClient({
			token: TOKEN,
			baseUrl: "https://postman.test.invalid",
			fetch,
		});
		await client.me.get();
		expect(calls[0]?.url).toContain("https://postman.test.invalid");
	});

	it("wraps limitReachedError as PostmanPlanLimitError", async () => {
		const { fetch } = stubFetch([
			{
				status: 403,
				text: JSON.stringify({
					error: {
						name: "limitReachedError",
						message: "upgrade required",
					},
				}),
			},
		]);
		const client = createPostmanClient({ token: TOKEN, fetch });
		const err = await client.specs.list("ws1").catch((e: unknown) => e);
		expect((err as Error).name).toBe("PostmanPlanLimitError");
		expect((err as Error).message).toBe("upgrade required");
	});

	it("re-throws ProviderApiError when error body is non-JSON", async () => {
		const { fetch } = stubFetch([{ status: 403, text: "not-json" }]);
		const client = createPostmanClient({ token: TOKEN, fetch });
		const err = await client.specs.list("ws1").catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
	});

	it("re-throws ProviderApiError when error body is valid JSON but not a plan limit", async () => {
		const { fetch } = stubFetch([
			{
				status: 500,
				text: JSON.stringify({ message: "internal error" }),
			},
		]);
		const client = createPostmanClient({ token: TOKEN, fetch });
		const err = await client.specs.list("ws1").catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
	});
});
