import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createJiraClient } from "../index.js";

const HOST = "https://myorg.atlassian.net/rest/api/2";
const TOKEN = Buffer.from("user@example.com:api-token").toString("base64");

function mockFetch(responses: Array<{ status?: number; body?: unknown }>) {
	const calls: Array<{ url: string; method: string; body: unknown }> = [];
	let i = 0;
	return {
		mock: vi.fn(async (url: string, init?: RequestInit) => {
			const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
			calls.push({ url, method: (init?.method ?? "GET").toUpperCase(), body });
			const next = responses[i++] ?? { status: 200, body: {} };
			const status = next.status ?? 200;
			if (status === 204) return new Response(null, { status });
			return new Response(JSON.stringify(next.body ?? {}), { status });
		}),
		calls,
	};
}

let stub: ReturnType<typeof mockFetch>;

beforeEach(() => {
	stub = mockFetch([]);
	vi.stubGlobal("fetch", stub.mock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const client = createJiraClient({ host: HOST, token: TOKEN });

describe("issues", () => {
	it("creates a ticket via POST /issue/", async () => {
		stub = mockFetch([{ status: 201, body: { id: "1", key: "PROJ-1" } }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.issues.create("Bug title", "Bug", "PROJ");
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.url).toContain("/issue/");
		expect(stub.calls[0]?.body).toMatchObject({ fields: { project: { key: "PROJ" }, summary: "Bug title" } });
	});

	it("gets a ticket via GET /issue/:key", async () => {
		stub = mockFetch([{ body: { id: "1", key: "PROJ-1", fields: {} } }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.issues.get("PROJ-1");
		expect(stub.calls[0]?.method).toBe("GET");
		expect(stub.calls[0]?.url).toContain("/issue/PROJ-1");
	});

	it("sends Authorization: Basic header", async () => {
		stub = mockFetch([{ body: { id: "1", key: "PROJ-1", fields: {} } }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.issues.get("PROJ-1");
		const headers = (stub.mock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
		expect(headers["Authorization"]).toBe(`Basic ${TOKEN}`);
	});
});

describe("versions", () => {
	it("creates a version via POST /version", async () => {
		stub = mockFetch([{ status: 201, body: { id: "10001" } }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.versions.create("v1.0.0", "PROJ");
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.url).toContain("/version");
		expect(stub.calls[0]?.body).toMatchObject({ name: "v1.0.0", project: "PROJ" });
	});

	it("deletes a version via DELETE /version/:id (204)", async () => {
		stub = mockFetch([{ status: 204 }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.versions.delete("10001");
		expect(stub.calls[0]?.method).toBe("DELETE");
		expect(stub.calls[0]?.url).toContain("/version/10001");
	});
});

describe("projects", () => {
	it("gets a project with issueTypes expanded", async () => {
		stub = mockFetch([{ body: { id: "10000", key: "PROJ" } }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.projects.get("PROJ");
		expect(stub.calls[0]?.url).toContain("/project/PROJ");
		expect(stub.calls[0]?.url).toContain("expand=issueTypes");
	});
});

describe("issues (extended)", () => {
	it("updates a ticket via PUT /issue/:key", async () => {
		stub = mockFetch([{ status: 204 }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.issues.update("PROJ-1", { priority: { name: "High" } });
		expect(stub.calls[0]?.method).toBe("PUT");
		expect(stub.calls[0]?.url).toContain("/issue/PROJ-1");
		expect(stub.calls[0]?.body).toEqual({ fields: { priority: { name: "High" } } });
	});

	it("fetches multiple tickets via getMany (parallel GETs)", async () => {
		stub = mockFetch([
			{ body: { id: "1", key: "PROJ-1", fields: {} } },
			{ body: { id: "2", key: "PROJ-2", fields: {} } },
		]);
		vi.stubGlobal("fetch", stub.mock);
		const results = await client.issues.getMany(["PROJ-1", "PROJ-2"]);
		expect(results).toHaveLength(2);
		expect(stub.calls.some((c) => c.url.includes("PROJ-1"))).toBe(true);
		expect(stub.calls.some((c) => c.url.includes("PROJ-2"))).toBe(true);
	});

	it("gets a ticket property via GET /issue/:key/properties/:property", async () => {
		stub = mockFetch([{ body: { key: "my-prop", value: { foo: "bar" } } }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.issues.getProperty("PROJ-1", "my-prop");
		expect(stub.calls[0]?.method).toBe("GET");
		expect(stub.calls[0]?.url).toContain("/issue/PROJ-1/properties/my-prop");
	});

	it("searches via GET /search with query params", async () => {
		stub = mockFetch([{ body: { issues: [], total: 0 } }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.issues.search({ jql: "project = PROJ AND status = Open", maxResults: "10" });
		expect(stub.calls[0]?.method).toBe("GET");
		expect(stub.calls[0]?.url).toContain("/search");
		expect(stub.calls[0]?.url).toContain("jql=");
	});
});

describe("versions (extended)", () => {
	it("gets a version via GET /version/:id", async () => {
		stub = mockFetch([{ body: { id: "10001", name: "v1.0.0" } }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.versions.get("10001");
		expect(stub.calls[0]?.method).toBe("GET");
		expect(stub.calls[0]?.url).toContain("/version/10001");
	});

	it("fetches multiple versions via getMany (parallel GETs)", async () => {
		stub = mockFetch([
			{ body: { id: "10001", name: "v1.0.0" } },
			{ body: { id: "10002", name: "v1.1.0" } },
		]);
		vi.stubGlobal("fetch", stub.mock);
		const results = await client.versions.getMany(["10001", "10002"]);
		expect(results).toHaveLength(2);
	});

	it("updates a version via PUT /version/:id", async () => {
		stub = mockFetch([{ body: { id: "10001", name: "v1.0.1" } }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.versions.update("10001", { name: "v1.0.1", released: true });
		expect(stub.calls[0]?.method).toBe("PUT");
		expect(stub.calls[0]?.url).toContain("/version/10001");
		expect(stub.calls[0]?.body).toMatchObject({ name: "v1.0.1", released: true });
	});
});

describe("transitions", () => {
	it("creates a transition via POST /issue/:key/transitions", async () => {
		stub = mockFetch([{ status: 204 }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.transitions.create("PROJ-1", "31");
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.url).toContain("/issue/PROJ-1/transitions");
		expect(stub.calls[0]?.body).toMatchObject({ transition: { id: "31" } });
	});

	it("gets available transitions via GET /issue/:key/transitions", async () => {
		stub = mockFetch([{ body: { transitions: [{ id: "31", name: "Done" }] } }]);
		vi.stubGlobal("fetch", stub.mock);
		const result = await client.transitions.get("PROJ-1");
		expect(stub.calls[0]?.method).toBe("GET");
		expect(stub.calls[0]?.url).toContain("/issue/PROJ-1/transitions");
		expect(result.transitions[0]?.name).toBe("Done");
	});

	it("gets resolutions via GET /resolution", async () => {
		stub = mockFetch([{ body: [{ id: "1", name: "Fixed" }] }]);
		vi.stubGlobal("fetch", stub.mock);
		await client.transitions.getResolutions();
		expect(stub.calls[0]?.method).toBe("GET");
		expect(stub.calls[0]?.url).toContain("/resolution");
	});
});

describe("links", () => {
	it("creates an issue link via POST /issueLink, returns status code", async () => {
		stub = mockFetch([{ status: 201 }]);
		vi.stubGlobal("fetch", stub.mock);
		const status = await client.links.create("PROJ-1", "PROJ-2", "Blocks");
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.url).toContain("/issueLink");
		expect(stub.calls[0]?.body).toMatchObject({
			type: { name: "Blocks" },
			inwardIssue: { key: "PROJ-1" },
			outwardIssue: { key: "PROJ-2" },
		});
		expect(status).toBe(201);
	});

	it("creates multiple links via createMany (parallel POSTs)", async () => {
		stub = mockFetch([{ status: 201 }, { status: 201 }]);
		vi.stubGlobal("fetch", stub.mock);
		const results = await client.links.createMany(["PROJ-1", "PROJ-2"], "PROJ-3", "Blocks");
		expect(results).toHaveLength(2);
		expect(results[0]).toMatchObject({ ticket: "PROJ-1", status: 201 });
		expect(results[1]).toMatchObject({ ticket: "PROJ-2", status: 201 });
	});

	it("gets link types via GET /issueLinkType", async () => {
		stub = mockFetch([{ body: { issueLinkTypes: [{ id: "10001", name: "Blocks" }] } }]);
		vi.stubGlobal("fetch", stub.mock);
		const result = await client.links.getLinkTypes();
		expect(stub.calls[0]?.method).toBe("GET");
		expect(stub.calls[0]?.url).toContain("/issueLinkType");
		expect(result.issueLinkTypes[0]?.name).toBe("Blocks");
	});
});
