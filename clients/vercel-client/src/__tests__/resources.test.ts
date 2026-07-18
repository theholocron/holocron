import { describe, expect, it } from "vitest";
import { createVercelClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "vercel-test-token";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createVercelClient({ token: TOKEN, fetch }), calls };
}

describe("user.get", () => {
	it("GET /v2/user", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					user: {
						id: "u1",
						email: "n@example.com",
						username: "newton",
					},
				},
			},
		]);
		const result = await client.user.get();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/v2/user");
		expect(result.user?.username).toBe("newton");
	});
});

describe("projects.list", () => {
	it("GET /v10/projects", async () => {
		const { client, calls } = makeClient([
			{ body: { projects: [{ id: "p1", name: "my-app" }] } },
		]);
		const result = await client.projects.list();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/v10/projects");
		expect(result.projects[0]?.name).toBe("my-app");
	});
});

describe("projects.get", () => {
	it("GET /v10/projects/{nameOrId}", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "p1", name: "my-app", framework: "nextjs" } },
		]);
		const result = await client.projects.get("my-app");
		expect(calls[0]?.url).toContain("/v10/projects/my-app");
		expect(result.framework).toBe("nextjs");
	});
});

describe("projects.create", () => {
	it("POST /v11/projects with name and framework", async () => {
		const { client, calls } = makeClient([
			{
				status: 200,
				body: { id: "p2", name: "new-app", framework: "nextjs" },
			},
		]);
		await client.projects.create({ name: "new-app", framework: "nextjs" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/v11/projects");
		expect(calls[0]?.body).toMatchObject({
			name: "new-app",
			framework: "nextjs",
		});
	});

	it("includes gitRepository when repo is provided", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "p2", name: "new-app" } },
		]);
		await client.projects.create({ name: "new-app", repo: "org/repo" });
		expect(calls[0]?.body).toMatchObject({
			gitRepository: { type: "github", repo: "org/repo" },
		});
	});
});

describe("projects.update", () => {
	it("PATCH /v9/projects/{id}", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "p1", name: "my-app" } },
		]);
		await client.projects.update("p1", {
			previewDeploymentsDisabled: true,
		});
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/v9/projects/p1");
		expect(calls[0]?.body).toMatchObject({
			previewDeploymentsDisabled: true,
		});
	});
});

describe("env.list", () => {
	it("GET /v9/projects/{id}/env", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					envs: [
						{ id: "e1", key: "API_URL", target: ["production"] },
					],
				},
			},
		]);
		const result = await client.env.list("p1");
		expect(calls[0]?.url).toContain("/v9/projects/p1/env");
		expect(result.envs[0]?.key).toBe("API_URL");
	});
});

describe("env.set", () => {
	it("POST /v10/projects/{id}/env?upsert=true", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "e2", key: "DB_URL", target: ["production"] } },
		]);
		await client.env.set("p1", "production", "DB_URL", "postgres://...");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/v10/projects/p1/env");
		expect(calls[0]?.url).toContain("upsert=true");
		expect(calls[0]?.body).toMatchObject({
			key: "DB_URL",
			value: "postgres://...",
			target: ["production"],
			type: "encrypted",
		});
	});
});

describe("deployments.trigger", () => {
	it("POST /v13/deployments with gitSource", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "d1",
					url: "my-app.vercel.app",
					readyState: "BUILDING",
				},
			},
		]);
		const result = await client.deployments.trigger({
			projectName: "my-app",
			branch: "main",
			repoId: 12345,
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/v13/deployments");
		expect(calls[0]?.body).toMatchObject({
			name: "my-app",
			gitSource: { type: "github", ref: "main", repoId: 12345 },
		});
		expect(result.id).toBe("d1");
	});

	it("includes target when provided", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "d1",
					url: "my-app.vercel.app",
					readyState: "QUEUED",
				},
			},
		]);
		await client.deployments.trigger({
			projectName: "my-app",
			branch: "main",
			repoId: 12345,
			target: "production",
		});
		expect(calls[0]?.body).toMatchObject({ target: "production" });
	});
});

describe("deployments.get", () => {
	it("GET /v13/deployments/{id}", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "d1",
					url: "my-app.vercel.app",
					readyState: "READY",
				},
			},
		]);
		const result = await client.deployments.get("d1");
		expect(calls[0]?.url).toContain("/v13/deployments/d1");
		expect(result.readyState).toBe("READY");
	});
});
