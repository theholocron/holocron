import { describe, expect, it } from "vitest";
import { createInfisicalClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "infisical-test-pat";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createInfisicalClient({ token: TOKEN, fetch }), calls };
}

describe("workspaces.list", () => {
	it("GET /v1/workspace", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					workspaces: [
						{ id: "ws1", name: "my-project", slug: "my-project" },
					],
				},
			},
		]);
		const result = await client.workspaces.list();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/v1/workspace");
		expect(result.workspaces?.[0]?.name).toBe("my-project");
	});
});

describe("workspaces.get", () => {
	it("GET /v1/workspace/{workspaceId}", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					workspace: {
						environments: [
							{ id: "e1", name: "Development", slug: "dev" },
							{ id: "e2", name: "Production", slug: "prd" },
						],
					},
				},
			},
		]);
		const result = await client.workspaces.get("ws1");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/v1/workspace/ws1");
		expect(result.workspace?.environments).toHaveLength(2);
	});

	it("URL-encodes workspace ids with special characters", async () => {
		const { client, calls } = makeClient([{ body: { workspace: {} } }]);
		await client.workspaces.get("ws/special");
		expect(calls[0]?.url).toContain("/v1/workspace/ws%2Fspecial");
	});
});

describe("workspaces.create", () => {
	it("POST /v2/workspace with projectName and slug", async () => {
		const { client, calls } = makeClient([{ status: 200, body: {} }]);
		await client.workspaces.create("my-project", "my-project");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/v2/workspace");
		expect(calls[0]?.body).toMatchObject({
			projectName: "my-project",
			slug: "my-project",
		});
	});
});

describe("workspaces.createEnvironment", () => {
	it("POST /v1/workspace/{workspaceId}/environments", async () => {
		const { client, calls } = makeClient([{ status: 200, body: {} }]);
		await client.workspaces.createEnvironment("ws1", "Development", "dev");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/v1/workspace/ws1/environments");
		expect(calls[0]?.body).toMatchObject({
			environmentName: "Development",
			environmentSlug: "dev",
		});
	});
});
