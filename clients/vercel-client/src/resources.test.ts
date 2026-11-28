import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createVercelClient } from "./index.js";

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

	it("sends installCommand as a project setting when given, and leaves it out otherwise", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "d1", url: "my-app.vercel.app", readyState: "QUEUED" } },
			{ body: { id: "d2", url: "my-app.vercel.app", readyState: "QUEUED" } },
		]);
		await client.deployments.create({
			projectName: "my-app",
			files: [{ file: "index.js", content: "x" }],
			installCommand: "npm install --legacy-peer-deps",
		});
		await client.deployments.create({ projectName: "my-app", files: [{ file: "index.js", content: "x" }] });
		expect((calls[0]?.body as { projectSettings: unknown }).projectSettings).toEqual({
			framework: null,
			installCommand: "npm install --legacy-peer-deps",
		});
		expect((calls[1]?.body as { projectSettings: unknown }).projectSettings).toEqual({ framework: null });
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

describe("deployments.create meta", () => {
	it("sends the creator's own tags as meta, and omits it when there are none", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "d1", url: "a.vercel.app", readyState: "QUEUED" } },
			{ body: { id: "d2", url: "b.vercel.app", readyState: "QUEUED" } },
			{ body: { id: "d3", url: "c.vercel.app", readyState: "QUEUED" } },
		]);
		const files = [{ file: "index.js", content: "x" }];
		await client.deployments.create({ projectName: "p", files, meta: { holocronPreview: "holocron-pr-7" } });
		await client.deployments.create({ projectName: "p", files, meta: {} });
		await client.deployments.create({ projectName: "p", files });
		expect(calls[0]?.body).toMatchObject({ meta: { holocronPreview: "holocron-pr-7" } });
		expect(calls[1]?.body).not.toHaveProperty("meta");
		expect(calls[2]?.body).not.toHaveProperty("meta");
	});
});

describe("deployments.list", () => {
	it("GET /v6/deployments for the project, 100 to a page, and returns each deployment's meta", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					deployments: [
						{
							id: "d1",
							url: "a.vercel.app",
							readyState: "READY",
							meta: { holocronPreview: "holocron-pr-7" },
						},
					],
					pagination: { next: 1700000000000 },
				},
			},
		]);
		const page = await client.deployments.list({ projectId: "sentinel" });
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/v6/deployments");
		expect(calls[0]?.url).toContain("projectId=sentinel");
		expect(calls[0]?.url).toContain("limit=100");
		expect(calls[0]?.url).not.toContain("until=");
		expect(page.deployments[0]?.meta?.holocronPreview).toBe("holocron-pr-7");
		expect(page.pagination?.next).toBe(1700000000000);
	});

	it("passes the page size and where the next page starts", async () => {
		const { client, calls } = makeClient([{ body: { deployments: [] } }]);
		await client.deployments.list({ projectId: "sentinel", limit: 20, until: 1700000000000 });
		expect(calls[0]?.url).toContain("limit=20");
		expect(calls[0]?.url).toContain("until=1700000000000");
	});
});

describe("deployments.remove", () => {
	it("DELETE /v13/deployments/{id}", async () => {
		const { client, calls } = makeClient([{ body: { uid: "d1", state: "DELETED" } }]);
		const result = await client.deployments.remove("d1");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/v13/deployments/d1");
		expect(result).toEqual({ uid: "d1", state: "DELETED" });
	});

	it("encodes the id", async () => {
		const { client, calls } = makeClient([{ body: { uid: "x", state: "DELETED" } }]);
		await client.deployments.remove("a/b");
		expect(calls[0]?.url).toContain("/v13/deployments/a%2Fb");
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

describe("webhooks", () => {
	it("list: GET /v1/webhooks returns the bare array", async () => {
		const { client, calls } = makeClient([
			{ body: [{ id: "account_hook_1", url: "https://r.example/vercel", events: ["deployment.error"] }] },
		]);
		const result = await client.webhooks.list();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/v1/webhooks");
		expect(result[0]?.id).toBe("account_hook_1");
	});

	it("create: POST /v1/webhooks with url, events and projectIds, returns the secret", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "account_hook_2",
					url: "https://r.example/vercel",
					events: ["deployment.error"],
					secret: "s3",
				},
			},
		]);
		const result = await client.webhooks.create({
			url: "https://r.example/vercel",
			events: ["deployment.error"],
			projectIds: ["prj_1"],
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toMatchObject({
			url: "https://r.example/vercel",
			events: ["deployment.error"],
			projectIds: ["prj_1"],
		});
		expect(result.secret).toBe("s3");
	});
});

describe("projects.create rootDirectory", () => {
	it("includes rootDirectory when provided", async () => {
		const { client, calls } = makeClient([{ body: { id: "p2", name: "new-app" } }]);
		await client.projects.create({ name: "new-app", rootDirectory: "apps/web" });
		expect(calls[0]?.body).toMatchObject({ rootDirectory: "apps/web" });
	});
});
