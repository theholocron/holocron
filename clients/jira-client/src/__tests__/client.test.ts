import { describe, expect, it } from "vitest";

import { createJiraClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const HOST = "https://myorg.atlassian.net/rest/api/2";
const TOKEN = Buffer.from("user@example.com:api-token").toString("base64");

describe("issues", () => {
	it("creates a ticket via POST /issue/", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 201, body: { id: "1", key: "PROJ-1" } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.issues.create("Bug title", "Bug", "PROJ");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/issue/");
		expect(calls[0]?.body).toMatchObject({
			fields: { project: { key: "PROJ" }, summary: "Bug title" },
		});
	});

	it("gets a ticket via GET /issue/:key", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { id: "1", key: "PROJ-1", fields: {} } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.issues.get("PROJ-1");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/issue/PROJ-1");
	});

	it("sends authorization: Basic header", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { id: "1", key: "PROJ-1", fields: {} } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.issues.get("PROJ-1");
		expect(calls[0]?.headers["authorization"]).toBe(`Basic ${TOKEN}`);
	});
});

describe("versions", () => {
	it("creates a version via POST /version", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 201, body: { id: "10001" } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.versions.create("v1.0.0", "PROJ");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/version");
		expect(calls[0]?.body).toMatchObject({
			name: "v1.0.0",
			project: "PROJ",
		});
	});

	it("deletes a version via DELETE /version/:id (204)", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.versions.delete("10001");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/version/10001");
	});
});

describe("projects", () => {
	it("gets a project with issueTypes expanded", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { id: "10000", key: "PROJ" } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.projects.get("PROJ");
		expect(calls[0]?.url).toContain("/project/PROJ");
		expect(calls[0]?.url).toContain("expand=issueTypes");
	});
});

describe("issues (extended)", () => {
	it("updates a ticket via PUT /issue/:key", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.issues.update("PROJ-1", { priority: { name: "High" } });
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/issue/PROJ-1");
		expect(calls[0]?.body).toEqual({
			fields: { priority: { name: "High" } },
		});
	});

	it("fetches multiple tickets via getMany (parallel GETs)", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { id: "1", key: "PROJ-1", fields: {} } },
			{ body: { id: "2", key: "PROJ-2", fields: {} } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		const results = await client.issues.getMany(["PROJ-1", "PROJ-2"]);
		expect(results).toHaveLength(2);
		expect(calls.some((c) => c.url.includes("PROJ-1"))).toBe(true);
		expect(calls.some((c) => c.url.includes("PROJ-2"))).toBe(true);
	});

	it("gets a ticket property via GET /issue/:key/properties/:property", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { key: "my-prop", value: { foo: "bar" } } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.issues.getProperty("PROJ-1", "my-prop");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/issue/PROJ-1/properties/my-prop");
	});

	it("searches via GET /search with query params", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { issues: [], total: 0 } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.issues.search({
			jql: "project = PROJ AND status = Open",
			maxResults: 10,
		});
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/search");
		expect(calls[0]?.url).toContain("jql=");
	});

	it("passes startAt and fields in search query params", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { issues: [], total: 0 } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.issues.search({
			startAt: 10,
			fields: ["summary", "status"],
		});
		expect(calls[0]?.url).toContain("startAt=10");
		expect(calls[0]?.url).toContain("fields=summary%2Cstatus");
	});
});

describe("versions (extended)", () => {
	it("gets a version via GET /version/:id", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { id: "10001", name: "v1.0.0" } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.versions.get("10001");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/version/10001");
	});

	it("fetches multiple versions via getMany (parallel GETs)", async () => {
		const { fetch } = stubFetch([
			{ body: { id: "10001", name: "v1.0.0" } },
			{ body: { id: "10002", name: "v1.1.0" } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		const results = await client.versions.getMany(["10001", "10002"]);
		expect(results).toHaveLength(2);
	});

	it("updates a version via PUT /version/:id", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { id: "10001", name: "v1.0.1" } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.versions.update("10001", {
			name: "v1.0.1",
			released: true,
		});
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/version/10001");
		expect(calls[0]?.body).toMatchObject({
			name: "v1.0.1",
			released: true,
		});
	});
});

describe("transitions", () => {
	it("creates a transition via POST /issue/:key/transitions", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.transitions.create("PROJ-1", "31");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/issue/PROJ-1/transitions");
		expect(calls[0]?.body).toMatchObject({ transition: { id: "31" } });
	});

	it("gets available transitions via GET /issue/:key/transitions", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { transitions: [{ id: "31", name: "Done" }] } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		const result = await client.transitions.get("PROJ-1");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/issue/PROJ-1/transitions");
		expect(result.transitions[0]?.name).toBe("Done");
	});

	it("gets resolutions via GET /resolution", async () => {
		const { fetch, calls } = stubFetch([
			{ body: [{ id: "1", name: "Fixed" }] },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		await client.transitions.getResolutions();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/resolution");
	});
});

describe("links", () => {
	it("creates an issue link via POST /issueLink, returns status code", async () => {
		const { fetch, calls } = stubFetch([{ status: 201, body: {} }]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		const status = await client.links.create("PROJ-1", "PROJ-2", "Blocks");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/issueLink");
		expect(calls[0]?.body).toMatchObject({
			type: { name: "Blocks" },
			inwardIssue: { key: "PROJ-1" },
			outwardIssue: { key: "PROJ-2" },
		});
		expect(status).toBe(201);
	});

	it("creates multiple links via createMany (parallel POSTs)", async () => {
		const { fetch } = stubFetch([
			{ status: 201, body: {} },
			{ status: 201, body: {} },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		const results = await client.links.createMany(
			["PROJ-1", "PROJ-2"],
			"PROJ-3",
			"Blocks",
		);
		expect(results).toHaveLength(2);
		expect(results[0]).toMatchObject({ ticket: "PROJ-1", status: 201 });
		expect(results[1]).toMatchObject({ ticket: "PROJ-2", status: 201 });
	});

	it("gets link types via GET /issueLinkType", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { issueLinkTypes: [{ id: "10001", name: "Blocks" }] } },
		]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		const result = await client.links.getLinkTypes();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/issueLinkType");
		expect(result.issueLinkTypes[0]?.name).toBe("Blocks");
	});

	it("returns error status from create when API responds with 4xx", async () => {
		const { fetch } = stubFetch([{ status: 400, body: {} }]);
		const client = createJiraClient({ host: HOST, token: TOKEN, fetch });
		const status = await client.links.create("PROJ-1", "PROJ-2", "Blocks");
		expect(status).toBe(400);
	});

	it("rethrows transport failures (status 0) so createMany rejects", async () => {
		const fetch = async () => {
			throw new TypeError("fetch failed");
		};
		const client = createJiraClient({
			host: HOST,
			token: TOKEN,
			fetch: fetch as unknown as typeof globalThis.fetch,
		});
		await expect(
			client.links.create("PROJ-1", "PROJ-2", "Blocks"),
		).rejects.toMatchObject({ name: "ProviderApiError", status: 0 });
	});
});
