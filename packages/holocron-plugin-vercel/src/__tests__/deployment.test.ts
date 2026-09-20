import { ProviderApiError } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { VercelDeployment } from "../capabilities/deployment.js";
import { createVercelClient } from "../rest.js";

function makeDeployment(
	responses: Parameters<typeof stubFetch>[0],
	opts: { teamId?: string; defaultFramework?: string } = {}
) {
	const { fetch, calls } = stubFetch(responses);
	const clientOpts: Parameters<typeof createVercelClient>[0] = { token: "pat", fetch };
	if (opts.teamId !== undefined) clientOpts.teamId = opts.teamId;
	const client = createVercelClient(clientOpts);
	const deploymentOpts: ConstructorParameters<typeof VercelDeployment>[1] = {};
	if (opts.defaultFramework !== undefined) deploymentOpts.defaultFramework = opts.defaultFramework;
	const deployment = new VercelDeployment(() => client, deploymentOpts);
	return { deployment, calls };
}

function project(
	overrides: Partial<{
		id: string;
		name: string;
		framework: string | null;
		rootDirectory: string | null;
		link: { type?: string; repoId?: number; repo?: string } | null;
	}> = {}
) {
	return {
		id: "prj_123",
		name: "web",
		framework: "nextjs",
		rootDirectory: null,
		link: null,
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────
// listProjects + ensureProject
// ──────────────────────────────────────────────────────────────────────

describe("VercelDeployment.listProjects", () => {
	it("GETs /v10/projects and maps the result", async () => {
		const { deployment, calls } = makeDeployment([
			{ status: 200, body: { projects: [project({ id: "p1", name: "web" })] } },
		]);
		const result = await deployment.listProjects();
		expect(calls[0]?.url).toBe("https://api.vercel.com/v10/projects");
		expect(result).toEqual([{ id: "p1", name: "web", framework: "nextjs", gitLinked: false, rootDirectory: null }]);
	});

	it("includes teamId in the query string when configured", async () => {
		const { deployment, calls } = makeDeployment([{ status: 200, body: { projects: [] } }], { teamId: "team_xx" });
		await deployment.listProjects();
		expect(calls[0]?.url).toContain("teamId=team_xx");
	});

	it("maps gitLinked=true when project.link.repoId is set", async () => {
		const { deployment } = makeDeployment([
			{
				status: 200,
				body: { projects: [project({ link: { repoId: 42, type: "github" } })] },
			},
		]);
		const [p] = await deployment.listProjects();
		expect(p?.gitLinked).toBe(true);
	});
});

describe("VercelDeployment.ensureProject", () => {
	it("returns the existing project when one exists (no POST)", async () => {
		const { deployment, calls } = makeDeployment([
			{ status: 200, body: project({ id: "prj_existing", name: "web" }) },
		]);
		const result = await deployment.ensureProject({ name: "web" });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("GET");
		expect(result.id).toBe("prj_existing");
	});

	it("creates a new project when none exists (404→POST)", async () => {
		const { deployment, calls } = makeDeployment([
			{ status: 404, text: "not found" },
			{ status: 201, body: project({ id: "prj_new", name: "web", framework: "nextjs" }) },
		]);
		const result = await deployment.ensureProject({ name: "web" });
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toContain("/v11/projects");
		expect(calls[1]?.body).toEqual({ name: "web", framework: "nextjs" });
		expect(result.id).toBe("prj_new");
	});

	it("includes git + rootDirectory when supplied to create", async () => {
		const { deployment, calls } = makeDeployment([
			{ status: 404, text: "not found" },
			{ status: 201, body: project({ id: "prj_new", name: "web" }) },
		]);
		await deployment.ensureProject({
			name: "web",
			repo: "theholocron/holocron",
			rootDirectory: "apps/web",
		});
		expect(calls[1]?.body).toEqual({
			name: "web",
			framework: "nextjs",
			gitRepository: { type: "github", repo: "theholocron/holocron" },
			rootDirectory: "apps/web",
		});
	});

	it("uses defaultFramework override when supplied", async () => {
		const { deployment, calls } = makeDeployment(
			[
				{ status: 404, text: "not found" },
				{ status: 201, body: project() },
			],
			{ defaultFramework: "remix" }
		);
		await deployment.ensureProject({ name: "app" });
		expect((calls[1]?.body as { framework: string }).framework).toBe("remix");
	});

	it("rethrows non-404 errors from the GET (does not swallow 500s)", async () => {
		const { deployment } = makeDeployment([{ status: 500, text: "oops" }]);
		await expect(deployment.ensureProject({ name: "web" })).rejects.toBeInstanceOf(ProviderApiError);
	});
});

// ──────────────────────────────────────────────────────────────────────
// updateProjectSettings
// ──────────────────────────────────────────────────────────────────────

describe("VercelDeployment.updateProjectSettings", () => {
	it("PATCHes only the fields supplied (no over-writing of defaults)", async () => {
		const { deployment, calls } = makeDeployment([{ status: 200, body: project() }]);
		await deployment.updateProjectSettings("prj_123", { previewDeploymentsDisabled: true });
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/v9/projects/prj_123");
		expect(calls[0]?.body).toEqual({ previewDeploymentsDisabled: true });
	});

	it("wraps gitProviderCreateDeployments in gitProviderOptions", async () => {
		const { deployment, calls } = makeDeployment([{ status: 200, body: project() }]);
		await deployment.updateProjectSettings("prj_123", { gitProviderCreateDeployments: false });
		expect(calls[0]?.body).toEqual({
			gitProviderOptions: { createDeployments: false },
		});
	});
});

// ──────────────────────────────────────────────────────────────────────
// env vars
// ──────────────────────────────────────────────────────────────────────

describe("VercelDeployment.listEnvVars", () => {
	it("returns only the names of vars scoped to the requested target", async () => {
		const { deployment } = makeDeployment([
			{
				status: 200,
				body: {
					envs: [
						{ id: "e1", key: "PROD_ONLY", target: ["production"] },
						{ id: "e2", key: "EVERYWHERE", target: ["production", "preview", "development"] },
						{ id: "e3", key: "PREVIEW_ONLY", target: ["preview"] },
					],
				},
			},
		]);
		const names = await deployment.listEnvVars("prj_123", "production");
		expect(names).toEqual(["PROD_ONLY", "EVERYWHERE"]);
	});
});

describe("VercelDeployment.setEnvVar", () => {
	it("POSTs with upsert=true + the right target + encrypted type", async () => {
		const { deployment, calls } = makeDeployment([{ status: 201, body: {} }]);
		await deployment.setEnvVar("prj_123", "production", "CLERK_WEBHOOK_SECRET", "val");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe("https://api.vercel.com/v10/projects/prj_123/env?upsert=true");
		expect(calls[0]?.body).toEqual({
			key: "CLERK_WEBHOOK_SECRET",
			value: "val",
			target: ["production"],
			type: "encrypted",
		});
	});
});

// ──────────────────────────────────────────────────────────────────────
// triggerDeployment + getDeployment
// ──────────────────────────────────────────────────────────────────────

describe("VercelDeployment.triggerDeployment", () => {
	it("looks up repoId from the project, then POSTs the deploy with gitSource", async () => {
		const { deployment, calls } = makeDeployment([
			{ status: 200, body: project({ link: { repoId: 42, type: "github" } }) },
			{
				status: 201,
				body: {
					id: "dpl_1",
					url: "web-abc.vercel.app",
					readyState: "QUEUED",
				},
			},
		]);
		const result = await deployment.triggerDeployment({
			projectId: "prj_123",
			branch: "feat/x",
		});
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toBe("https://api.vercel.com/v13/deployments");
		expect(calls[1]?.body).toEqual({
			name: "web",
			gitSource: { type: "github", ref: "feat/x", repoId: 42 },
		});
		expect(result.status).toBe("queued");
		expect(result.branch).toBe("feat/x");
	});

	it("passes named `target` through to the deploy body", async () => {
		const { deployment, calls } = makeDeployment([
			{ status: 200, body: project({ link: { repoId: 42 } }) },
			{ status: 201, body: { id: "dpl_1", url: "x", readyState: "BUILDING", target: "production" } },
		]);
		await deployment.triggerDeployment({
			projectId: "prj_123",
			branch: "main",
			target: "production",
		});
		expect((calls[1]?.body as { target: string }).target).toBe("production");
	});

	it("throws a clear error when the project has no linked git repo", async () => {
		const { deployment } = makeDeployment([{ status: 200, body: project({ link: null }) }]);
		await expect(deployment.triggerDeployment({ projectId: "prj_123", branch: "main" })).rejects.toThrow(
			/no linked GitHub repo/
		);
	});

	it('normalizes readyState CANCELED → status "cancelled" (US spelling)', async () => {
		const { deployment } = makeDeployment([
			{ status: 200, body: project({ link: { repoId: 42 } }) },
			{ status: 201, body: { id: "dpl_1", url: "x", readyState: "CANCELED" } },
		]);
		const result = await deployment.triggerDeployment({
			projectId: "prj_123",
			branch: "main",
		});
		expect(result.status).toBe("cancelled");
	});
});

describe("VercelDeployment.getDeployment", () => {
	it("GETs the deployment and extracts branch from meta.githubCommitRef", async () => {
		const { deployment, calls } = makeDeployment([
			{
				status: 200,
				body: {
					id: "dpl_1",
					url: "web-abc.vercel.app",
					readyState: "READY",
					meta: { githubCommitRef: "main" },
				},
			},
		]);
		const result = await deployment.getDeployment("dpl_1");
		expect(calls[0]?.url).toBe("https://api.vercel.com/v13/deployments/dpl_1");
		expect(result).toEqual({
			id: "dpl_1",
			url: "web-abc.vercel.app",
			branch: "main",
			status: "ready",
		});
	});

	it("returns branch=null when the deployment has no git source", async () => {
		const { deployment } = makeDeployment([{ status: 200, body: { id: "dpl_1", url: "x", readyState: "READY" } }]);
		const result = await deployment.getDeployment("dpl_1");
		expect(result.branch).toBeNull();
	});
});

// ──────────────────────────────────────────────────────────────────────
// deployFunction
// ──────────────────────────────────────────────────────────────────────

describe("VercelDeployment.deployFunction", () => {
	it("POSTs inline files with no gitSource and framework: null", async () => {
		const { deployment, calls } = makeDeployment([
			{ status: 201, body: { id: "dpl_1", url: "sentinel-abc.vercel.app", readyState: "QUEUED" } },
		]);
		const result = await deployment.deployFunction("sentinel", {
			files: { "api/webhook.js": "export default () => {};" },
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe("https://api.vercel.com/v13/deployments");
		expect(calls[0]?.body).toEqual({
			name: "sentinel",
			files: [
				{
					file: "api/webhook.js",
					data: Buffer.from("export default () => {};", "utf8").toString("base64"),
					encoding: "base64",
				},
			],
			projectSettings: { framework: null },
		});
		expect(result).toEqual({ deploymentId: "dpl_1", url: "sentinel-abc.vercel.app" });
	});

	it("passes every file in the map, and target when provided", async () => {
		const { deployment, calls } = makeDeployment([
			{ status: 201, body: { id: "dpl_2", url: "x", readyState: "QUEUED", target: "production" } },
		]);
		await deployment.deployFunction("sentinel", {
			files: { "api/webhook.js": "a", "package.json": "{}" },
			target: "production",
		});
		const body = calls[0]?.body as { files: { file: string }[]; target: string };
		expect(body.files.map((f) => f.file)).toEqual(["api/webhook.js", "package.json"]);
		expect(body.target).toBe("production");
	});

	it("ignores defaultFramework — deployFunction always ships with no framework preset", async () => {
		const { deployment, calls } = makeDeployment(
			[{ status: 201, body: { id: "dpl_3", url: "x", readyState: "QUEUED" } }],
			{ defaultFramework: "nextjs" }
		);
		await deployment.deployFunction("sentinel", { files: { "index.js": "x" } });
		expect((calls[0]?.body as { projectSettings: { framework: unknown } }).projectSettings.framework).toBeNull();
	});
});

describe("VercelDeployment.ensureCustomDomain", () => {
	it("already attached + DNS already routes to Vercel → no-op (list → config, no POST)", async () => {
		const { deployment, calls } = makeDeployment([
			{
				status: 200,
				body: { domains: [{ name: "sentinel.theholocron.dev", apexName: "theholocron.dev", verified: true }] },
			},
			{
				status: 200,
				body: { configuredBy: "CNAME", misconfigured: false, recommendedCNAME: [], recommendedIPv4: [] },
			},
		]);
		const result = await deployment.ensureCustomDomain("prj_123", "sentinel.theholocron.dev");
		expect(calls).toHaveLength(2);
		expect(calls[0]?.method).toBe("GET");
		expect(calls.every((c) => c.method === "GET")).toBe(true);
		expect(result).toBeNull();
	});

	it("already attached but DNS never configured → returns the record from config() (the 409-on-readd case)", async () => {
		const { deployment, calls } = makeDeployment([
			{
				status: 200,
				body: { domains: [{ name: "sentinel.theholocron.dev", apexName: "theholocron.dev", verified: true }] },
			},
			{
				status: 200,
				body: {
					configuredBy: null,
					misconfigured: true,
					recommendedCNAME: [{ rank: 1, value: "d1d4fc829fe7bc7c.vercel-dns-017.com" }],
					recommendedIPv4: [],
				},
			},
		]);
		const result = await deployment.ensureCustomDomain("prj_123", "sentinel.theholocron.dev");
		expect(calls).toHaveLength(2);
		expect(calls[1]?.url).toContain("/v6/domains/sentinel.theholocron.dev/config");
		expect(calls[1]?.url).toContain("projectIdOrName=prj_123");
		expect(result).toEqual({
			zone: "theholocron.dev",
			record: { type: "CNAME", name: "sentinel.theholocron.dev", content: "d1d4fc829fe7bc7c.vercel-dns-017.com" },
		});
	});

	it("adds the domain when missing, then checks DNS config (list → POST → config)", async () => {
		const { deployment, calls } = makeDeployment([
			{ status: 200, body: { domains: [] } },
			{
				status: 201,
				body: {
					name: "sentinel.theholocron.dev",
					apexName: "theholocron.dev",
					verified: false,
					verification: [
						{
							type: "CNAME",
							domain: "sentinel.theholocron.dev",
							value: "should-be-ignored.vercel-dns.com",
							reason: "Set the following record",
						},
					],
				},
			},
			{
				status: 200,
				body: {
					configuredBy: null,
					misconfigured: true,
					recommendedCNAME: [{ rank: 1, value: "d1d4fc829fe7bc7c.vercel-dns-017.com" }],
					recommendedIPv4: [],
				},
			},
		]);
		const result = await deployment.ensureCustomDomain("prj_123", "sentinel.theholocron.dev");
		expect(calls).toHaveLength(3);
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toBe("https://api.vercel.com/v10/projects/prj_123/domains");
		expect(calls[1]?.body).toEqual({ name: "sentinel.theholocron.dev" });
		// The value comes from config(), not add()'s own verification challenge.
		expect(result).toEqual({
			zone: "theholocron.dev",
			record: { type: "CNAME", name: "sentinel.theholocron.dev", content: "d1d4fc829fe7bc7c.vercel-dns-017.com" },
		});
	});

	it("a 409 on add (race — already attached) falls back to a re-list for apexName", async () => {
		const { deployment, calls } = makeDeployment([
			{ status: 200, body: { domains: [] } },
			{ status: 409, text: "domain already exists" },
			{
				status: 200,
				body: { domains: [{ name: "sentinel.theholocron.dev", apexName: "theholocron.dev", verified: true }] },
			},
			{
				status: 200,
				body: { configuredBy: "CNAME", misconfigured: false, recommendedCNAME: [], recommendedIPv4: [] },
			},
		]);
		const result = await deployment.ensureCustomDomain("prj_123", "sentinel.theholocron.dev");
		expect(calls).toHaveLength(4);
		expect(result).toBeNull();
	});

	it("rethrows non-409 errors from add() (does not swallow 500s)", async () => {
		const { deployment } = makeDeployment([
			{ status: 200, body: { domains: [] } },
			{ status: 500, text: "oops" },
		]);
		await expect(deployment.ensureCustomDomain("prj_123", "sentinel.theholocron.dev")).rejects.toBeInstanceOf(
			ProviderApiError
		);
	});

	it("returns null when misconfigured but config() has no CNAME recommendation", async () => {
		const { deployment } = makeDeployment([
			{
				status: 200,
				body: { domains: [{ name: "sentinel.theholocron.dev", apexName: "theholocron.dev", verified: true }] },
			},
			{
				status: 200,
				body: { configuredBy: null, misconfigured: true, recommendedCNAME: [], recommendedIPv4: [] },
			},
		]);
		const result = await deployment.ensureCustomDomain("prj_123", "sentinel.theholocron.dev");
		expect(result).toBeNull();
	});
});
