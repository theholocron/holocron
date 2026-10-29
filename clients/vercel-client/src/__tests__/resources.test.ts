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
		const { client, calls } = makeClient([{ body: { projects: [{ id: "p1", name: "my-app" }] } }]);
		const result = await client.projects.list();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/v10/projects");
		expect(result.projects[0]?.name).toBe("my-app");
	});
});

describe("projects.get", () => {
	it("GET /v10/projects/{nameOrId}", async () => {
		const { client, calls } = makeClient([{ body: { id: "p1", name: "my-app", framework: "nextjs" } }]);
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
		const { client, calls } = makeClient([{ body: { id: "p2", name: "new-app" } }]);
		await client.projects.create({ name: "new-app", repo: "org/repo" });
		expect(calls[0]?.body).toMatchObject({
			gitRepository: { type: "github", repo: "org/repo" },
		});
	});
});

describe("projects.update", () => {
	it("PATCH /v9/projects/{id}", async () => {
		const { client, calls } = makeClient([{ body: { id: "p1", name: "my-app" } }]);
		await client.projects.update("p1", {
			previewDeploymentsDisabled: true,
		});
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/v9/projects/p1");
		expect(calls[0]?.body).toMatchObject({
			previewDeploymentsDisabled: true,
		});
	});

	it("includes gitProviderOptions when provided", async () => {
		const { client, calls } = makeClient([{ body: { id: "p1", name: "my-app" } }]);
		await client.projects.update("p1", {
			gitProviderOptions: { createDeployments: true },
		});
		expect(calls[0]?.body).toMatchObject({
			gitProviderOptions: { createDeployments: true },
		});
	});
});

describe("env.list", () => {
	it("GET /v9/projects/{id}/env", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					envs: [{ id: "e1", key: "API_URL", target: ["production"] }],
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
		const { client, calls } = makeClient([{ body: { id: "e2", key: "DB_URL", target: ["production"] } }]);
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

describe("deployments.create", () => {
	it("POST /v13/deployments with base64-encoded inline files, no gitSource", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "d1",
					url: "my-app.vercel.app",
					readyState: "QUEUED",
				},
			},
		]);
		const result = await client.deployments.create({
			projectName: "my-app",
			files: [{ file: "api/webhook.js", content: "export default () => {};" }],
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/v13/deployments");
		expect(calls[0]?.body).toMatchObject({
			name: "my-app",
			files: [
				{
					file: "api/webhook.js",
					data: Buffer.from("export default () => {};", "utf8").toString("base64"),
					encoding: "base64",
				},
			],
			projectSettings: { framework: null },
		});
		expect((calls[0]?.body as { gitSource?: unknown }).gitSource).toBeUndefined();
		expect(result.id).toBe("d1");
	});

	it("passes framework through when set, and target when provided", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "d1",
					url: "my-app.vercel.app",
					readyState: "QUEUED",
				},
			},
		]);
		await client.deployments.create({
			projectName: "my-app",
			files: [{ file: "index.js", content: "x" }],
			framework: "nextjs",
			target: "production",
		});
		expect(calls[0]?.body).toMatchObject({
			projectSettings: { framework: "nextjs" },
			target: "production",
		});
	});

	it("omits target for a preview deployment", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "d1",
					url: "my-app.vercel.app",
					readyState: "QUEUED",
				},
			},
		]);
		await client.deployments.create({
			projectName: "my-app",
			files: [{ file: "index.js", content: "x" }],
		});
		expect((calls[0]?.body as { target?: unknown }).target).toBeUndefined();
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

describe("domains.list", () => {
	it("GET /v9/projects/{id}/domains", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					domains: [{ name: "sentinel.theholocron.dev", apexName: "theholocron.dev", verified: true }],
				},
			},
		]);
		const result = await client.domains.list("prj_123");
		expect(calls[0]?.url).toContain("/v9/projects/prj_123/domains");
		expect(result.domains).toHaveLength(1);
		expect(result.domains[0]?.name).toBe("sentinel.theholocron.dev");
	});
});

describe("domains.add", () => {
	it("POST /v10/projects/{id}/domains with the domain name", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					name: "sentinel.theholocron.dev",
					apexName: "theholocron.dev",
					verified: false,
					verification: [
						{
							type: "CNAME",
							domain: "sentinel.theholocron.dev",
							value: "d1d4fc829fe7bc7c.vercel-dns-017.com",
							reason: "Set the following record on your DNS provider to continue",
						},
					],
				},
			},
		]);
		const result = await client.domains.add("prj_123", "sentinel.theholocron.dev");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/v10/projects/prj_123/domains");
		expect(calls[0]?.body).toEqual({ name: "sentinel.theholocron.dev" });
		expect(result.verified).toBe(false);
		expect(result.verification?.[0]?.value).toBe("d1d4fc829fe7bc7c.vercel-dns-017.com");
	});
});

describe("domains.config", () => {
	it("GET /v6/domains/{domain}/config with projectIdOrName", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					configuredBy: null,
					misconfigured: true,
					recommendedCNAME: [{ rank: 1, value: "d1d4fc829fe7bc7c.vercel-dns-017.com" }],
					recommendedIPv4: [],
				},
			},
		]);
		const result = await client.domains.config("sentinel.theholocron.dev", "prj_123");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/v6/domains/sentinel.theholocron.dev/config");
		expect(calls[0]?.url).toContain("projectIdOrName=prj_123");
		expect(result.misconfigured).toBe(true);
		expect(result.recommendedCNAME[0]?.value).toBe("d1d4fc829fe7bc7c.vercel-dns-017.com");
	});

	it("omits projectIdOrName from the query when not passed", async () => {
		const { client, calls } = makeClient([
			{ body: { configuredBy: "CNAME", misconfigured: false, recommendedCNAME: [], recommendedIPv4: [] } },
		]);
		await client.domains.config("sentinel.theholocron.dev");
		expect(calls[0]?.url).not.toContain("projectIdOrName");
	});
});
