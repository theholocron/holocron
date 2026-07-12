import { describe, expect, it } from "vitest";

import { createToken, createZendeskClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://myorg.zendesk.com";
const TOKEN = createToken("agent@example.com", "test-token");

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createZendeskClient({ baseUrl: BASE, token: TOKEN, fetch });
	return { client, calls };
}

describe("createToken", () => {
	it("base64-encodes user/token:password", () => {
		const tok = createToken("user@example.com", "abc123");
		expect(tok).toBe(Buffer.from("user@example.com/token:abc123").toString("base64"));
	});
});

describe("activities", () => {
	it("GET /api/v2/activities", async () => {
		const { client, calls } = makeClient([{ body: { activities: [] } }]);
		await client.activities.get();
		expect(calls[0]?.url).toContain("/api/v2/activities");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("forwards query params", async () => {
		const { client, calls } = makeClient([{ body: { activities: [] } }]);
		await client.activities.get({ per_page: "50" });
		expect(calls[0]?.url).toContain("per_page=50");
	});
});

describe("search", () => {
	it("GET /api/v2/search with query and default sort_order=desc", async () => {
		const { client, calls } = makeClient([{ body: { results: [] } }]);
		await client.search.query("type:ticket status:open");
		expect(calls[0]?.url).toContain("/api/v2/search");
		expect(calls[0]?.url).toContain("query=type%3Aticket+status%3Aopen");
		expect(calls[0]?.url).toContain("sort_order=desc");
	});
});

describe("status", () => {
	it("GET /api/v2/custom_statuses (list)", async () => {
		const { client, calls } = makeClient([{ body: { custom_statuses: [] } }]);
		await client.status.list();
		expect(calls[0]?.url).toContain("/api/v2/custom_statuses");
		expect(calls[0]?.method).toBe("GET");
	});

	it("GET /api/v2/custom_statuses/:id", async () => {
		const { client, calls } = makeClient([{ body: { custom_status: {} } }]);
		await client.status.get(42);
		expect(calls[0]?.url).toContain("/api/v2/custom_statuses/42");
	});

	it("POST /api/v2/custom_statuses on create", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { custom_status: {} } }]);
		await client.status.create({ agent_label: "Escalated", status_category: "open" } as never);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toEqual({ custom_status: { agent_label: "Escalated", status_category: "open" } });
	});

	it("PUT /api/v2/custom_statuses/:id on update", async () => {
		const { client, calls } = makeClient([{ body: { custom_status: {} } }]);
		await client.status.update(42, { agent_label: "Updated" } as never);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/42");
	});
});

describe("tickets", () => {
	it("GET /api/v2/tickets (list) includes custom_statuses", async () => {
		const { client, calls } = makeClient([{ body: { tickets: [] } }]);
		await client.tickets.list();
		expect(calls[0]?.url).toContain("include=custom_statuses");
	});

	it("GET /api/v2/tickets/:id", async () => {
		const { client, calls } = makeClient([{ body: { ticket: {} } }]);
		await client.tickets.get(123);
		expect(calls[0]?.url).toContain("/api/v2/tickets/123");
	});

	it("POST /api/v2/tickets on create", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { ticket: { id: 1 } } }]);
		await client.tickets.create({ subject: "Help", comment: { body: "Issue" } } as never);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toEqual({ ticket: { subject: "Help", comment: { body: "Issue" } } });
	});

	it("PUT /api/v2/tickets/:id on update", async () => {
		const { client, calls } = makeClient([{ body: { ticket: {} } }]);
		await client.tickets.update(123, { status: "solved" } as never);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/api/v2/tickets/123");
	});

	it("DELETE /api/v2/tickets/:id", async () => {
		const { client, calls } = makeClient([{ status: 204 }]);
		await client.tickets.delete(123);
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/api/v2/tickets/123");
	});
});

describe("comments", () => {
	it("GET /api/v2/tickets/:id/comments", async () => {
		const { client, calls } = makeClient([{ body: { comments: [] } }]);
		await client.comments.list(123);
		expect(calls[0]?.url).toContain("/api/v2/tickets/123/comments");
	});

	it("PUT /api/v2/tickets/:id on create comment", async () => {
		const { client, calls } = makeClient([{ body: { ticket: {} } }]);
		await client.comments.create(123, "Thanks for reaching out");
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.body).toEqual({ ticket: { comment: { body: "Thanks for reaching out" } } });
	});
});

describe("fields", () => {
	it("GET /api/v2/ticket_fields (list)", async () => {
		const { client, calls } = makeClient([{ body: { ticket_fields: [] } }]);
		await client.fields.list();
		expect(calls[0]?.url).toContain("/api/v2/ticket_fields");
		expect(calls[0]?.method).toBe("GET");
	});

	it("GET /api/v2/ticket_fields/:id", async () => {
		const { client, calls } = makeClient([{ body: { ticket_field: {} } }]);
		await client.fields.get(7);
		expect(calls[0]?.url).toContain("/api/v2/ticket_fields/7");
	});

	it("DELETE /api/v2/ticket_fields/:id", async () => {
		const { client, calls } = makeClient([{ status: 204 }]);
		await client.fields.delete(7);
		expect(calls[0]?.method).toBe("DELETE");
	});
});
