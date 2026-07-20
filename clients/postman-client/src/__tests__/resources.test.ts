import { describe, expect, it } from "vitest";
import { createPostmanClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "postman-test-key";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createPostmanClient({ token: TOKEN, fetch }), calls };
}

describe("me.get", () => {
	it("GET /me", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					user: { id: 1, username: "newton", email: "n@example.com" },
				},
			},
		]);
		const result = await client.me.get();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/me");
		expect(result.user?.username).toBe("newton");
	});
});

describe("workspaces.list", () => {
	it("GET /workspaces", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					workspaces: [
						{ id: "ws1", name: "My Workspace", type: "personal" },
					],
				},
			},
		]);
		const result = await client.workspaces.list();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/workspaces");
		expect(result.workspaces[0]?.name).toBe("My Workspace");
	});
});

describe("collections.list", () => {
	it("GET /collections?workspace={id}", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					collections: [{ id: "c1", uid: "c1-uid", name: "My API" }],
				},
			},
		]);
		const result = await client.collections.list("ws1");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/collections");
		expect(calls[0]?.url).toContain("workspace=ws1");
		expect(result.collections[0]?.name).toBe("My API");
	});
});

describe("collections.delete", () => {
	it("DELETE /collections/{uid}", async () => {
		const { client, calls } = makeClient([{ status: 200, body: {} }]);
		await client.collections.delete("c1-uid");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/collections/c1-uid");
	});
});

describe("environments.list", () => {
	it("GET /environments?workspace={id}", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					environments: [
						{ id: "e1", uid: "e1-uid", name: "Production" },
					],
				},
			},
		]);
		const result = await client.environments.list("ws1");
		expect(calls[0]?.url).toContain("/environments");
		expect(calls[0]?.url).toContain("workspace=ws1");
		expect(result.environments[0]?.name).toBe("Production");
	});
});

describe("environments.create", () => {
	it("POST /environments?workspace={id}", async () => {
		const { client, calls } = makeClient([
			{
				status: 200,
				body: {
					environment: { id: "e2", uid: "e2-uid", name: "Staging" },
				},
			},
		]);
		const env = { name: "Staging", values: [] };
		await client.environments.create("ws1", env);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/environments");
		expect(calls[0]?.url).toContain("workspace=ws1");
		expect(calls[0]?.body).toMatchObject({ environment: env });
	});
});

describe("environments.update", () => {
	it("PUT /environments/{uid}", async () => {
		const { client, calls } = makeClient([
			{
				status: 200,
				body: {
					environment: {
						id: "e1",
						uid: "e1-uid",
						name: "Production",
					},
				},
			},
		]);
		const env = {
			name: "Production",
			values: [{ key: "URL", value: "https://prod" }],
		};
		await client.environments.update("e1-uid", env);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/environments/e1-uid");
		expect(calls[0]?.body).toMatchObject({ environment: env });
	});
});

describe("specs.list", () => {
	it("GET /specs?workspaceId={id}", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					specs: [
						{ id: "s1", name: "My API Spec", type: "OPENAPI:3.0" },
					],
				},
			},
		]);
		const result = await client.specs.list("ws1");
		expect(calls[0]?.url).toContain("/specs");
		expect(calls[0]?.url).toContain("workspaceId=ws1");
		expect(result.specs[0]?.name).toBe("My API Spec");
	});
});

describe("specs.create", () => {
	it("POST /specs?workspaceId={id} with name + files", async () => {
		const { client, calls } = makeClient([
			{
				status: 200,
				body: { id: "s2", name: "New Spec", type: "OPENAPI:3.0" },
			},
		]);
		await client.specs.create("ws1", {
			name: "New Spec",
			fileContent: '{"openapi":"3.0"}',
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/specs");
		expect(calls[0]?.url).toContain("workspaceId=ws1");
		expect(calls[0]?.body).toMatchObject({
			name: "New Spec",
			type: "OPENAPI:3.0",
			files: [{ path: "index.json", content: '{"openapi":"3.0"}' }],
		});
	});
});

describe("specs.updateFile", () => {
	it("PATCH /specs/{specId}/files/{filePath}", async () => {
		const { client, calls } = makeClient([{ status: 200, body: {} }]);
		await client.specs.updateFile("s1", "index.json", '{"openapi":"3.1"}');
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/specs/s1/files/index.json");
		expect(calls[0]?.body).toEqual({ content: '{"openapi":"3.1"}' });
	});
});

describe("import.openapi", () => {
	it("POST /import/openapi?workspace={id}", async () => {
		const { client, calls } = makeClient([
			{
				status: 200,
				body: {
					collections: [
						{ id: "c2", uid: "c2-uid", name: "Imported" },
					],
				},
			},
		]);
		const spec = { openapi: "3.0.0", info: { title: "My API" } };
		const result = await client.import.openapi("ws1", spec);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/import/openapi");
		expect(calls[0]?.url).toContain("workspace=ws1");
		expect(calls[0]?.body).toMatchObject({ type: "string" });
		expect(result.collections[0]?.name).toBe("Imported");
	});

	it("passes a string spec through without JSON-encoding it", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: { collections: [] } },
		]);
		const raw = '{"openapi":"3.1.0"}';
		await client.import.openapi("ws2", raw);
		expect(calls[0]?.body).toMatchObject({ input: raw });
	});
});
