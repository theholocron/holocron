import { describe, expect, it } from "vitest";

import { createCloudflareClient } from "../index.js";
import { cfOk, stubFetch } from "./helpers.js";

const BASE = "https://cf.test/client/v4";
const ACCOUNT = "acc-123";
const PROJECT_NAME = "my-docs";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { pages: createCloudflareClient({ token: "tok", baseUrl: BASE, fetch }).pages, calls };
}

const project = {
	id: "proj-1",
	name: PROJECT_NAME,
	subdomain: "my-docs.pages.dev",
	domains: [],
	production_branch: "main",
	deployment_configs: {
		preview: { env_vars: {} },
		production: { env_vars: {} },
	},
};

const deployment = {
	id: "deploy-abc",
	url: "https://abc.my-docs.pages.dev",
	environment: "preview" as const,
	deployment_trigger: { type: "ad_hoc", metadata: { branch: "feat/my-pr", commit_hash: "abc123" } },
	latest_stage: { name: "deploy", status: "success" as const },
	created_on: "2026-08-26T00:00:00Z",
};

describe("pages.listProjects", () => {
	it("GETs /accounts/{accountId}/pages/projects", async () => {
		const { pages, calls } = client([cfOk([project])]);
		const result = await pages.listProjects(ACCOUNT);
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects`);
		expect(calls[0]?.url).toContain("per_page=100");
		expect(result[0]?.name).toBe(PROJECT_NAME);
	});
});

describe("pages.getProject", () => {
	it("GETs the specific project", async () => {
		const { pages, calls } = client([cfOk(project)]);
		await pages.getProject(ACCOUNT, PROJECT_NAME);
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects/${PROJECT_NAME}`);
		expect(calls[0]?.method).toBe("GET");
	});
});

describe("pages.createProject", () => {
	it("POSTs with name and production_branch", async () => {
		const { pages, calls } = client([cfOk(project)]);
		await pages.createProject(ACCOUNT, { name: PROJECT_NAME, production_branch: "main" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects`);
		expect(calls[0]?.body).toMatchObject({ name: PROJECT_NAME, production_branch: "main" });
	});
});

describe("pages.updateProject", () => {
	it("PATCHes the project with deployment_configs", async () => {
		const envVars = { FOO: { value: "bar", type: "plain_text" as const } };
		const { pages, calls } = client([cfOk(project)]);
		await pages.updateProject(ACCOUNT, PROJECT_NAME, {
			deployment_configs: {
				preview: { env_vars: envVars },
				production: { env_vars: {} },
			},
		});
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects/${PROJECT_NAME}`);
	});
});

describe("pages.createDeployment", () => {
	it("POSTs to /deployments with branch", async () => {
		const { pages, calls } = client([cfOk(deployment)]);
		await pages.createDeployment(ACCOUNT, PROJECT_NAME, "feat/my-pr");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects/${PROJECT_NAME}/deployments`);
		expect(calls[0]?.body).toEqual({ branch: "feat/my-pr" });
	});
});

describe("pages.getDeployment", () => {
	it("GETs the specific deployment", async () => {
		const { pages, calls } = client([cfOk(deployment)]);
		await pages.getDeployment(ACCOUNT, PROJECT_NAME, "deploy-abc");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects/${PROJECT_NAME}/deployments/deploy-abc`);
	});
});

describe("pages.listDomains", () => {
	it("GETs /projects/{name}/domains", async () => {
		const domain = { id: "dom-1", name: "*.preview.example.dev", status: "active" as const };
		const { pages, calls } = client([cfOk([domain])]);
		const result = await pages.listDomains(ACCOUNT, PROJECT_NAME);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects/${PROJECT_NAME}/domains`);
		expect(result[0]?.name).toBe("*.preview.example.dev");
	});
});

describe("pages.addDomain", () => {
	it("POSTs hostname to /projects/{name}/domains", async () => {
		const domain = { id: "dom-1", name: "*.preview.example.dev", status: "pending" as const };
		const { pages, calls } = client([cfOk(domain)]);
		await pages.addDomain(ACCOUNT, PROJECT_NAME, "*.preview.example.dev");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects/${PROJECT_NAME}/domains`);
		expect(calls[0]?.body).toEqual({ name: "*.preview.example.dev" });
	});
});

describe("pages.listDeployments", () => {
	it("GETs /projects/{name}/deployments with per_page=25", async () => {
		const { pages, calls } = client([cfOk([deployment])]);
		const result = await pages.listDeployments(ACCOUNT, PROJECT_NAME);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects/${PROJECT_NAME}/deployments`);
		expect(calls[0]?.url).toContain("per_page=25");
		expect(result[0]?.id).toBe("deploy-abc");
	});
});

describe("pages.deleteDeployment", () => {
	it("DELETEs /projects/{name}/deployments/{id} with force=true", async () => {
		const { pages, calls } = client([cfOk(null)]);
		await pages.deleteDeployment(ACCOUNT, PROJECT_NAME, "deploy-abc");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects/${PROJECT_NAME}/deployments/deploy-abc`);
		expect(calls[0]?.url).toContain("force=true");
	});
});
