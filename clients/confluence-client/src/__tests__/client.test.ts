import { describe, expect, it } from "vitest";

import { createConfluenceClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://myorg.atlassian.net/wiki/rest/api";
const TOKEN = Buffer.from("agent@example.com:test-token").toString("base64");

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createConfluenceClient({
		baseUrl: BASE,
		token: TOKEN,
		fetch,
	});
	return { client, calls };
}

describe("createConfluenceClient", () => {
	it("sends Bearer auth header on every request", async () => {
		const { client, calls } = makeClient([{ body: { id: "123" } }]);
		await client.page.get("123");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});
});

describe("page.get", () => {
	it("GET /<id>", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "123", title: "My Page" } },
		]);
		const result = await client.page.get<{ id: string; title: string }>(
			"123",
		);
		expect(result.title).toBe("My Page");
		expect(calls[0]?.url).toBe(`${BASE}/123`);
		expect(calls[0]?.method).toBe("GET");
	});
});

describe("page.update", () => {
	it("PUT /<id> with body", async () => {
		const update = {
			version: { number: 2 },
			title: "Updated",
			body: {
				storage: { value: "<p>Hi</p>", representation: "storage" },
			},
		};
		const { client, calls } = makeClient([{ body: { id: "123" } }]);
		await client.page.update("123", update);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toBe(`${BASE}/123`);
		expect(calls[0]?.body).toEqual(update);
	});
});
