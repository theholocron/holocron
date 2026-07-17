import { describe, expect, it } from "vitest";
import { createClerkClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "sk_test_abc123";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createClerkClient({ token: TOKEN, fetch });
	return { client, calls };
}

describe("webhooks.ensureSvixApp", () => {
	it("POST /webhooks/svix", async () => {
		const { client, calls } = makeClient([
			{ body: { svix_app_id: "app_1" } },
		]);
		const result = await client.webhooks.ensureSvixApp();
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/webhooks/svix");
		expect(calls[0]?.url).not.toContain("/webhooks/svix_url");
		expect(result.svix_app_id).toBe("app_1");
	});

	it("sends Bearer authorization header", async () => {
		const { client, calls } = makeClient([{ body: {} }]);
		await client.webhooks.ensureSvixApp();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});
});

describe("webhooks.getSvixUrl", () => {
	it("POST /webhooks/svix_url returns url field", async () => {
		const { client, calls } = makeClient([
			{ body: { url: "https://app.svix.com/login/abc" } },
		]);
		const result = await client.webhooks.getSvixUrl();
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/webhooks/svix_url");
		expect(result.url).toBe("https://app.svix.com/login/abc");
	});

	it("surfaces svix_url on older response shape", async () => {
		const { client } = makeClient([
			{ body: { svix_url: "https://app.svix.com/login/legacy" } },
		]);
		const result = await client.webhooks.getSvixUrl();
		expect(result.svix_url).toBe("https://app.svix.com/login/legacy");
	});
});
