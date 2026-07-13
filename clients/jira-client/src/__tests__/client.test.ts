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
