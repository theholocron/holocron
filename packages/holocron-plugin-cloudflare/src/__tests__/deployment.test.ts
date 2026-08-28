import { ProviderApiError } from "@theholocron/cli";
import type { CfPagesDeploymentStage } from "@theholocron/cloudflare-client";
import { describe, expect, it } from "vitest";

import { CloudflareDeployment } from "../capabilities/deployment.js";
import { createCloudflareClient } from "../rest.js";
import { cfOk, stubFetch } from "./helpers.js";

const BASE = "https://cf.test/client/v4";
const ACCOUNT = "acc-123";
const PROJECT_NAME = "my-docs";

function makeDeployment(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createCloudflareClient({ token: "cf-tok", baseUrl: BASE, fetch });
	return { dep: new CloudflareDeployment(client, ACCOUNT), calls };
}

const project = {
	id: "proj-1",
	name: PROJECT_NAME,
	subdomain: "my-docs.pages.dev",
	domains: [],
	production_branch: "main",
	deployment_configs: {
		preview: { env_vars: {} },
		production: { env_vars: { NODE_ENV: { value: "production", type: "plain_text" as const } } },
	},
};

const rawDeployment = {
	id: "deploy-abc",
	url: "https://abc.my-docs.pages.dev",
	environment: "preview" as const,
	deployment_trigger: { type: "ad_hoc", metadata: { branch: "feat/my-pr", commit_hash: "abc123" } },
	latest_stage: { name: "deploy", status: "success" as const },
	created_on: "2026-08-26T00:00:00Z",
};

describe("CloudflareDeployment.listProjects", () => {
	it("returns mapped projects", async () => {
		const { dep, calls } = makeDeployment([cfOk([project])]);
		const result = await dep.listProjects();
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects`);
		expect(result[0]).toEqual({ id: PROJECT_NAME, name: PROJECT_NAME });
	});
});

describe("CloudflareDeployment.ensureProject", () => {
	it("returns existing project when found", async () => {
		const { dep, calls } = makeDeployment([cfOk(project)]);
		const result = await dep.ensureProject({ name: PROJECT_NAME });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("GET");
		expect(result.name).toBe(PROJECT_NAME);
	});

	it("creates project when not found", async () => {
		const { dep, calls } = makeDeployment([
			{ status: 404, body: { success: false, errors: [], result: null } },
			cfOk(project),
		]);
		await dep.ensureProject({ name: PROJECT_NAME });
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.body).toMatchObject({ name: PROJECT_NAME, production_branch: "main" });
	});

	it("re-throws non-404 errors from getProject", async () => {
		const { dep } = makeDeployment([{ status: 500, body: { success: false, errors: [], result: null } }]);
		await expect(dep.ensureProject({ name: PROJECT_NAME })).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("CloudflareDeployment.updateProjectSettings", () => {
	it("GETs the current project and returns it (CF Pages has no disable-preview API)", async () => {
		const { dep, calls } = makeDeployment([cfOk(project)]);
		const result = await dep.updateProjectSettings(PROJECT_NAME, {});
		expect(calls[0]?.method).toBe("GET");
		expect(result.name).toBe(PROJECT_NAME);
	});
});

describe("CloudflareDeployment.listEnvVars", () => {
	it("returns production env var names", async () => {
		const { dep } = makeDeployment([cfOk(project)]);
		const vars = await dep.listEnvVars(PROJECT_NAME, "production");
		expect(vars).toEqual(["NODE_ENV"]);
	});

	it("returns empty array for preview with no vars", async () => {
		const { dep } = makeDeployment([cfOk(project)]);
		const vars = await dep.listEnvVars(PROJECT_NAME, "preview");
		expect(vars).toEqual([]);
	});
});

describe("CloudflareDeployment.setEnvVar", () => {
	it("PATCHes project with updated env var", async () => {
		const { dep, calls } = makeDeployment([cfOk(project), cfOk(project)]);
		await dep.setEnvVar(PROJECT_NAME, "preview", "MY_VAR", "my-value");
		expect(calls[1]?.method).toBe("PATCH");
		expect(calls[1]?.body).toMatchObject({
			deployment_configs: {
				preview: { env_vars: { MY_VAR: { value: "my-value", type: "plain_text" } } },
			},
		});
	});
});

describe("CloudflareDeployment.triggerDeployment", () => {
	it("POSTs a deployment and encodes projectName in id", async () => {
		const { dep, calls } = makeDeployment([cfOk(rawDeployment)]);
		const record = await dep.triggerDeployment({ projectId: PROJECT_NAME, branch: "feat/my-pr" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects/${PROJECT_NAME}/deployments`);
		expect(record.id).toBe(`${PROJECT_NAME}:deploy-abc`);
		expect(record.url).toBe(rawDeployment.url);
		expect(record.branch).toBe("feat/my-pr");
		expect(record.status).toBe("ready");
	});

	it("sets target when provided", async () => {
		const { dep } = makeDeployment([cfOk(rawDeployment)]);
		const record = await dep.triggerDeployment({ projectId: PROJECT_NAME, branch: "main", target: "production" });
		expect(record.target).toBe("production");
	});
});

describe("CloudflareDeployment.getDeployment", () => {
	it("parses projectName:deploymentId and fetches", async () => {
		const { dep, calls } = makeDeployment([cfOk(rawDeployment)]);
		await dep.getDeployment(`${PROJECT_NAME}:deploy-abc`);
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects/${PROJECT_NAME}/deployments/deploy-abc`);
	});

	it("throws ProviderApiError for malformed id", async () => {
		const { dep } = makeDeployment([]);
		await expect(dep.getDeployment("no-colon-here")).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("CloudflareDeployment.ensureCustomDomain", () => {
	it("adds the domain when not already present", async () => {
		const domain = { id: "dom-1", name: "*.preview.example.dev", status: "pending" as const };
		const { dep, calls } = makeDeployment([cfOk([]), cfOk(domain)]);
		await dep.ensureCustomDomain(PROJECT_NAME, "*.preview.example.dev");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain(`/projects/${PROJECT_NAME}/domains`);
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.body).toMatchObject({ name: "*.preview.example.dev" });
	});

	it("skips the POST when domain already exists", async () => {
		const domain = { id: "dom-1", name: "*.preview.example.dev", status: "active" as const };
		const { dep, calls } = makeDeployment([cfOk([domain])]);
		await dep.ensureCustomDomain(PROJECT_NAME, "*.preview.example.dev");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("GET");
	});
});

// These tests require listDeployments / deleteDeployment from clients PR #305.
// Un-skip once the catalog is bumped to include that release.
describe("CloudflareDeployment.listPreviewDeployments", () => {
	it.skip("returns deployments filtered by branch", async () => {
		const other = { ...rawDeployment, id: "deploy-other", deployment_trigger: { ...rawDeployment.deployment_trigger, metadata: { branch: "other-branch", commit_hash: "000" } } };
		const { dep, calls } = makeDeployment([cfOk([rawDeployment, other])]);
		const result = await dep.listPreviewDeployments(PROJECT_NAME, "feat/my-pr");
		expect(calls[0]?.url).toContain(`/accounts/${ACCOUNT}/pages/projects/${PROJECT_NAME}/deployments`);
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(`${PROJECT_NAME}:deploy-abc`);
		expect(result[0]?.branch).toBe("feat/my-pr");
	});

	it.skip("returns empty array when no deployments match the branch", async () => {
		const { dep } = makeDeployment([cfOk([rawDeployment])]);
		const result = await dep.listPreviewDeployments(PROJECT_NAME, "no-such-branch");
		expect(result).toHaveLength(0);
	});
});

describe("CloudflareDeployment.deletePreviewDeployments", () => {
	it.skip("deletes each deployment by id and returns count", async () => {
		const { dep, calls } = makeDeployment([cfOk(null), cfOk(null)]);
		const count = await dep.deletePreviewDeployments(PROJECT_NAME, [
			`${PROJECT_NAME}:deploy-abc`,
			`${PROJECT_NAME}:deploy-def`,
		]);
		expect(count).toBe(2);
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("deploy-abc");
		expect(calls[1]?.url).toContain("deploy-def");
	});

	it.skip("strips projectName: prefix before calling the API", async () => {
		const { dep, calls } = makeDeployment([cfOk(null)]);
		await dep.deletePreviewDeployments(PROJECT_NAME, [`${PROJECT_NAME}:deploy-abc`]);
		expect(calls[0]?.url).not.toContain(`${PROJECT_NAME}:`);
		expect(calls[0]?.url).toContain("deploy-abc");
	});
});

describe("CloudflareDeployment — status mapping", () => {
	const statusCases: Array<[CfPagesDeploymentStage["status"], string]> = [
		["idle", "queued"],
		["active", "building"],
		["success", "ready"],
		["failure", "error"],
		["canceled", "cancelled"],
	];

	for (const [cfStatus, expected] of statusCases) {
		it(`maps "${cfStatus}" → "${expected}"`, async () => {
			const { dep } = makeDeployment([
				cfOk({ ...rawDeployment, latest_stage: { name: "deploy", status: cfStatus } }),
			]);
			const record = await dep.triggerDeployment({ projectId: PROJECT_NAME, branch: "main" });
			expect(record.status).toBe(expected);
		});
	}
});
