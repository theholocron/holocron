import { createNetlifyClient } from "@theholocron/netlify-client";
import { describe, expect, it } from "vitest";

import { stubFetch } from "../helpers.js";
import { NetlifyDeployment } from "./deployment.js";

function makeCapability(
	opts?: { accountSlug?: string; accountId?: string; domain?: string },
	responses: Array<{ status?: number; body?: unknown }> = []
) {
	const stub = stubFetch(responses);
	const client = createNetlifyClient({ token: "t", fetch: stub.fetch });
	return { capability: new NetlifyDeployment(() => client, opts), stub };
}

describe("NetlifyDeployment", () => {
	it("constructs with a REST client", () => {
		expect(makeCapability().capability.key).toBe("deployment");
	});

	it("exposes `domain` from options", () => {
		const { capability } = makeCapability({ domain: "sentinel.theholocron.dev" });
		expect(capability.domain).toBe("sentinel.theholocron.dev");
	});

	describe("listProjects", () => {
		it("maps sites to DeploymentProject", async () => {
			const { capability } = makeCapability(undefined, [
				{
					status: 200,
					body: [
						{
							id: "s1",
							name: "sentinel",
							url: "http://sentinel.netlify.app",
							ssl_url: "https://sentinel.netlify.app",
							admin_url: "https://app.netlify.com/projects/sentinel",
							account_id: "a1",
						},
					],
				},
			]);
			const projects = await capability.listProjects();
			expect(projects).toEqual([{ id: "s1", name: "sentinel", gitLinked: false, rootDirectory: null }]);
		});
	});

	describe("ensureProject", () => {
		it("returns the existing site without creating when a name match is found", async () => {
			const { capability, stub } = makeCapability({ accountSlug: "iamnewton" }, [
				{
					status: 200,
					body: [{ id: "s1", name: "sentinel", url: "u", ssl_url: "su", admin_url: "au", account_id: "a1" }],
				},
			]);
			const project = await capability.ensureProject({ name: "sentinel" });
			expect(project.id).toBe("s1");
			expect(stub.calls).toHaveLength(1); // only the list call, no create
		});

		it("creates the site when no name match is found", async () => {
			const { capability, stub } = makeCapability({ accountSlug: "iamnewton" }, [
				{ status: 200, body: [] },
				{
					status: 200,
					body: { id: "s2", name: "new-site", url: "u", ssl_url: "su", admin_url: "au", account_id: "a1" },
				},
			]);
			const project = await capability.ensureProject({ name: "new-site" });
			expect(project.id).toBe("s2");
			expect(stub.calls[1]?.url).toContain("/iamnewton/sites");
			expect(stub.calls[1]?.method).toBe("POST");
		});

		it("throws when accountSlug is missing and the site doesn't already exist", async () => {
			const { capability } = makeCapability(undefined, [{ status: 200, body: [] }]);
			const err = await capability.ensureProject({ name: "x" }).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toMatch(/accountSlug/);
		});

		it("re-throws when the create fails for a reason unrelated to a name race", async () => {
			const { capability } = makeCapability({ accountSlug: "iamnewton" }, [
				{ status: 200, body: [] },
				{ status: 500, body: { message: "internal error" } },
			]);
			const err = await capability.ensureProject({ name: "x" }).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(Error);
			expect((err as { status?: number }).status).toBe(500);
		});

		it("re-throws a 422 when the recheck still doesn't find the site", async () => {
			const { capability } = makeCapability({ accountSlug: "iamnewton" }, [
				{ status: 200, body: [] },
				{ status: 422, body: { message: "something else entirely" } },
				{ status: 200, body: [] },
			]);
			const err = await capability.ensureProject({ name: "x" }).catch((e: unknown) => e);
			expect((err as { status?: number }).status).toBe(422);
		});

		it("recovers from a concurrent-create race (422) by re-checking", async () => {
			const { capability, stub } = makeCapability({ accountSlug: "iamnewton" }, [
				{ status: 200, body: [] },
				{ status: 422, body: { message: "site name already exists" } },
				{
					status: 200,
					body: [{ id: "s3", name: "raced", url: "u", ssl_url: "su", admin_url: "au", account_id: "a1" }],
				},
			]);
			const project = await capability.ensureProject({ name: "raced" });
			expect(project.id).toBe("s3");
			expect(stub.calls).toHaveLength(3);
		});
	});

	describe("updateProjectSettings", () => {
		it("returns the current project unchanged (no Netlify equivalent)", async () => {
			const { capability } = makeCapability(undefined, [
				{
					status: 200,
					body: { id: "s1", name: "sentinel", url: "u", ssl_url: "su", admin_url: "au", account_id: "a1" },
				},
			]);
			const project = await capability.updateProjectSettings("s1", { previewDeploymentsDisabled: true });
			expect(project.id).toBe("s1");
		});
	});

	describe("getDeployment", () => {
		it.each([
			["ready", "ready"],
			["current", "ready"],
			["error", "error"],
			["uploading", "building"],
			["new", "building"],
			["retrying", "building"],
		])("maps Netlify state %s to status %s", async (state, status) => {
			const { capability } = makeCapability(undefined, [
				{
					status: 200,
					body: {
						id: "d1",
						site_id: "s1",
						state,
						url: "u",
						ssl_url: "su",
						deploy_url: "du",
						branch: "main",
						created_at: "2026-01-01T00:00:00Z",
					},
				},
			]);
			const record = await capability.getDeployment("d1");
			expect(record.status).toBe(status);
		});

		it("surfaces error_message when present", async () => {
			const { capability } = makeCapability(undefined, [
				{
					status: 200,
					body: {
						id: "d1",
						site_id: "s1",
						state: "error",
						url: "u",
						ssl_url: "su",
						deploy_url: "du",
						branch: null,
						created_at: "t",
						error_message: "npm install failed",
					},
				},
			]);
			const record = await capability.getDeployment("d1");
			expect(record.errorMessage).toBe("npm install failed");
		});
	});

	describe("listEnvVars", () => {
		it("returns keys that have a value for the mapped context", async () => {
			const { capability } = makeCapability({ accountId: "acc1" }, [
				{
					status: 200,
					body: [
						{ key: "A", values: [{ value: "1", context: "production" }] },
						{ key: "B", values: [{ value: "2", context: "branch-deploy" }] },
					],
				},
			]);
			expect(await capability.listEnvVars("s1", "production")).toEqual(["A"]);
		});

		it("throws when accountId is missing", async () => {
			const { capability } = makeCapability(undefined, []);
			const err = await capability.listEnvVars("s1", "production").catch((e: unknown) => e);
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toMatch(/accountId/);
		});
	});

	describe("setEnvVar", () => {
		it("creates a new key when it doesn't exist yet", async () => {
			const { capability, stub } = makeCapability({ accountId: "acc1" }, [
				{ status: 200, body: [] },
				{ status: 200, body: {} },
			]);
			await capability.setEnvVar("s1", "production", "NEW_KEY", "v1");
			expect(stub.calls[1]?.method).toBe("POST");
			expect(stub.calls[1]?.url).toContain("/accounts/acc1/env");
			expect(stub.calls[1]?.body).toMatchObject({
				key: "NEW_KEY",
				values: [{ value: "v1", context: "production" }],
			});
		});

		it("replaces only the matching context's value, preserving others", async () => {
			const { capability, stub } = makeCapability({ accountId: "acc1" }, [
				{
					status: 200,
					body: [
						{
							key: "K",
							scopes: ["functions"],
							values: [
								{ value: "old-prod", context: "production" },
								{ value: "dev-val", context: "branch-deploy" },
							],
						},
					],
				},
				{ status: 200, body: {} },
			]);
			await capability.setEnvVar("s1", "production", "K", "new-prod");
			const call = stub.calls[1];
			expect(call?.method).toBe("PUT");
			expect(call?.url).toContain("/accounts/acc1/env/K");
			expect(call?.body).toMatchObject({
				values: [
					{ value: "dev-val", context: "branch-deploy" },
					{ value: "new-prod", context: "production" },
				],
			});
		});
	});

	describe("triggerDeployment", () => {
		it("triggers a build and resolves the resulting deploy", async () => {
			const { capability, stub } = makeCapability(undefined, [
				{ status: 200, body: { deploy_id: "d9" } },
				{
					status: 200,
					body: {
						id: "d9",
						site_id: "s1",
						state: "ready",
						url: "u",
						ssl_url: "su",
						deploy_url: "du",
						branch: "main",
						created_at: "t",
					},
				},
			]);
			const record = await capability.triggerDeployment({
				projectId: "s1",
				branch: "main",
				target: "production",
			});
			expect(record.id).toBe("d9");
			expect(stub.calls[0]?.url).toContain("/sites/s1/builds");
		});

		it("throws when Netlify returns no deploy_id", async () => {
			const { capability } = makeCapability(undefined, [{ status: 200, body: {} }]);
			const err = await capability
				.triggerDeployment({ projectId: "s1", branch: "main" })
				.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toMatch(/deploy_id/);
		});
	});

	describe("ensureCustomDomain", () => {
		it("patches custom_domain when unset and returns a CNAME record", async () => {
			const { capability, stub } = makeCapability(undefined, [
				{
					status: 200,
					body: {
						id: "s1",
						name: "sentinel",
						url: "http://sentinel.netlify.app",
						ssl_url: "https://sentinel.netlify.app",
						admin_url: "au",
						account_id: "a1",
						custom_domain: null,
					},
				},
				{ status: 200, body: {} },
			]);
			const result = await capability.ensureCustomDomain("s1", "sentinel.theholocron.dev");
			expect(stub.calls[1]?.method).toBe("PATCH");
			expect(stub.calls[1]?.body).toEqual({ custom_domain: "sentinel.theholocron.dev" });
			expect(result).toEqual({
				zone: "theholocron.dev",
				record: { type: "CNAME", name: "sentinel.theholocron.dev", content: "sentinel.netlify.app" },
			});
		});

		it("skips the PATCH when already set to the target hostname", async () => {
			const { capability, stub } = makeCapability(undefined, [
				{
					status: 200,
					body: {
						id: "s1",
						name: "sentinel",
						url: "u",
						ssl_url: "https://sentinel.netlify.app",
						admin_url: "au",
						account_id: "a1",
						custom_domain: "sentinel.theholocron.dev",
					},
				},
			]);
			const result = await capability.ensureCustomDomain("s1", "sentinel.theholocron.dev");
			expect(stub.calls).toHaveLength(1);
			expect(result?.zone).toBe("theholocron.dev");
		});
	});
});
