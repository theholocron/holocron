import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProviderApiError } from "@theholocron/cli";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PostmanTooling } from "../capabilities/tooling.js";
import { PostmanPlanLimitError } from "../errors.js";
import { PostmanRestClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

function makeTooling(
	responses: Parameters<typeof stubFetch>[0],
	opts: Partial<{
		specFile: string;
		specName: string;
		collectionName: string;
		envFiles: string[];
		repoRoot: string;
	}> = {}
) {
	const { fetch, calls } = stubFetch(responses);
	const rest = new PostmanRestClient({ token: "pmak-test", fetch });
	const tooling = new PostmanTooling(rest, { workspaceId: "ws-id", ...opts });
	return { tooling, calls };
}

// ──────────────────────────────────────────────────────────────────────
// Identity + construction
// ──────────────────────────────────────────────────────────────────────

describe("PostmanTooling identity", () => {
	it("reports key and providerName for the capability map", () => {
		const { tooling } = makeTooling([]);
		expect(tooling.key).toBe("tooling");
		expect(tooling.providerName).toBe("postman");
	});

	it("throws when workspaceId is missing", () => {
		const rest = new PostmanRestClient({ token: "t" });
		expect(() => new PostmanTooling(rest, { workspaceId: "" })).toThrow(/workspaceId/);
	});
});

// ──────────────────────────────────────────────────────────────────────
// Postman-specific methods
// ──────────────────────────────────────────────────────────────────────

describe("PostmanTooling.getMyself", () => {
	it("GETs /me and maps to PostmanUser", async () => {
		const { tooling, calls } = makeTooling([
			{ status: 200, body: { user: { id: 42, username: "iamnewton", fullName: "Newton" } } },
		]);
		const me = await tooling.getMyself();
		expect(calls[0]?.url).toBe("https://api.getpostman.com/me");
		expect(me).toEqual({ id: 42, username: "iamnewton", fullName: "Newton" });
	});
});

describe("PostmanTooling.listWorkspaces", () => {
	it("GETs /workspaces and maps results", async () => {
		const { tooling, calls } = makeTooling([
			{
				status: 200,
				body: {
					workspaces: [
						{ id: "w1", name: "Personal", type: "personal" },
						{ id: "w2", name: "Team", type: "team" },
					],
				},
			},
		]);
		const result = await tooling.listWorkspaces();
		expect(calls[0]?.url).toBe("https://api.getpostman.com/workspaces");
		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({ id: "w1", type: "personal" });
	});
});

describe("PostmanTooling.findCollectionByName", () => {
	it("GETs /collections?workspace=… and returns a match", async () => {
		const { tooling, calls } = makeTooling([
			{
				status: 200,
				body: {
					collections: [
						{ id: "c1", uid: "u1", name: "Other API" },
						{ id: "c2", uid: "u2", name: "Rando API" },
					],
				},
			},
		]);
		const result = await tooling.findCollectionByName({
			workspaceId: "ws-id",
			name: "Rando API",
		});
		expect(calls[0]?.url).toBe("https://api.getpostman.com/collections?workspace=ws-id");
		expect(result?.uid).toBe("u2");
	});

	it("returns null when no match", async () => {
		const { tooling } = makeTooling([
			{ status: 200, body: { collections: [{ id: "c1", uid: "u1", name: "Other" }] } },
		]);
		expect(await tooling.findCollectionByName({ workspaceId: "ws-id", name: "Missing" })).toBeNull();
	});
});

describe("PostmanTooling.deleteCollection", () => {
	it("DELETEs by uid", async () => {
		const { tooling, calls } = makeTooling([{ status: 200, body: {} }]);
		await tooling.deleteCollection("u2");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toBe("https://api.getpostman.com/collections/u2");
	});
});

describe("PostmanTooling.importOpenApi", () => {
	it("POSTs /import/openapi with workspace query + stringified spec", async () => {
		const { tooling, calls } = makeTooling([
			{
				status: 200,
				body: { collections: [{ id: "c1", uid: "u1", name: "Demo" }] },
			},
		]);
		const result = await tooling.importOpenApi({
			workspaceId: "ws-id",
			spec: { openapi: "3.0.0", info: { title: "Demo" } },
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe("https://api.getpostman.com/import/openapi?workspace=ws-id");
		const body = calls[0]?.body as { type: string; input: string };
		expect(body.type).toBe("string");
		expect(JSON.parse(body.input)).toEqual({ openapi: "3.0.0", info: { title: "Demo" } });
		expect(result.uid).toBe("u1");
	});

	it("throws clearly when Postman returns no collection on import", async () => {
		const { tooling } = makeTooling([{ status: 200, body: { collections: [] } }]);
		await expect(tooling.importOpenApi({ workspaceId: "ws-id", spec: {} })).rejects.toThrow(
			/no collection on import/
		);
	});
});

describe("PostmanTooling environments", () => {
	it("finds environments via /environments?workspace=…", async () => {
		const { tooling, calls } = makeTooling([
			{
				status: 200,
				body: {
					environments: [
						{ id: "e1", uid: "eu1", name: "staging" },
						{ id: "e2", uid: "eu2", name: "production" },
					],
				},
			},
		]);
		const result = await tooling.findEnvironmentByName({
			workspaceId: "ws-id",
			name: "production",
		});
		expect(calls[0]?.url).toBe("https://api.getpostman.com/environments?workspace=ws-id");
		expect(result?.uid).toBe("eu2");
	});

	it("createEnvironment POSTs with body wrapper", async () => {
		const { tooling, calls } = makeTooling([
			{ status: 200, body: { environment: { id: "e1", uid: "eu1", name: "staging" } } },
		]);
		await tooling.createEnvironment({
			workspaceId: "ws-id",
			environment: { name: "staging", values: [] },
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe("https://api.getpostman.com/environments?workspace=ws-id");
		expect(calls[0]?.body).toEqual({ environment: { name: "staging", values: [] } });
	});

	it("updateEnvironment PUTs to /environments/{uid}", async () => {
		const { tooling, calls } = makeTooling([
			{ status: 200, body: { environment: { id: "e1", uid: "eu1", name: "staging" } } },
		]);
		await tooling.updateEnvironment({ uid: "eu1", environment: { name: "staging" } });
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toBe("https://api.getpostman.com/environments/eu1");
	});
});

describe("PostmanTooling Spec Hub methods", () => {
	it("findSpecByName matches by name within workspace", async () => {
		const { tooling, calls } = makeTooling([
			{
				status: 200,
				body: {
					specs: [
						{ id: "s1", name: "Other", type: "OPENAPI:3.0" },
						{ id: "s2", name: "Demo", type: "OPENAPI:3.0" },
					],
				},
			},
		]);
		const result = await tooling.findSpecByName({ workspaceId: "ws-id", name: "Demo" });
		expect(calls[0]?.url).toBe("https://api.getpostman.com/specs?workspaceId=ws-id");
		expect(result?.id).toBe("s2");
	});

	it("createSpec POSTs flat name+type+files (not wrapped under spec)", async () => {
		const { tooling, calls } = makeTooling([
			{ status: 200, body: { id: "s_new", name: "Demo", type: "OPENAPI:3.0" } },
		]);
		await tooling.createSpec({
			workspaceId: "ws-id",
			name: "Demo",
			fileContent: '{"openapi":"3.0.0"}',
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe("https://api.getpostman.com/specs?workspaceId=ws-id");
		expect(calls[0]?.body).toEqual({
			name: "Demo",
			type: "OPENAPI:3.0",
			files: [{ path: "index.json", content: '{"openapi":"3.0.0"}' }],
		});
	});

	it("upsertSpecFile PATCHes /specs/{id}/files/{path}", async () => {
		const { tooling, calls } = makeTooling([{ status: 200, body: {} }]);
		await tooling.upsertSpecFile({
			specId: "s1",
			filePath: "index.json",
			content: '{"openapi":"3.0.0"}',
		});
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toBe("https://api.getpostman.com/specs/s1/files/index.json");
		expect(calls[0]?.body).toEqual({ content: '{"openapi":"3.0.0"}' });
	});
});

describe("PostmanRestClient — plan-limit discrimination", () => {
	it("throws PostmanPlanLimitError when the response is a limitReachedError", async () => {
		const { tooling } = makeTooling([
			{
				status: 403,
				text: JSON.stringify({
					error: { name: "limitReachedError", message: "You can create up to 0 APIs." },
				}),
			},
		]);
		const err = await tooling.getMyself().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(PostmanPlanLimitError);
		expect((err as PostmanPlanLimitError).limitMessage).toMatch(/0 APIs/);
	});

	it("throws generic ProviderApiError for non-limit 4xx", async () => {
		const { tooling } = makeTooling([{ status: 404, text: "not found" }]);
		const err = await tooling.getMyself().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect(err).not.toBeInstanceOf(PostmanPlanLimitError);
	});
});

// ──────────────────────────────────────────────────────────────────────
// sync() — orchestration
// ──────────────────────────────────────────────────────────────────────

describe("PostmanTooling.sync", () => {
	let repoRoot: string;

	beforeEach(async () => {
		repoRoot = await mkdtemp(join(tmpdir(), "holocron-postman-"));
	});
	afterEach(async () => {
		await rm(repoRoot, { recursive: true, force: true });
	});

	async function writeSpec(content: object): Promise<string> {
		const path = "apps/api/openapi.json";
		await mkdir(join(repoRoot, "apps/api"), { recursive: true });
		await writeFile(join(repoRoot, path), JSON.stringify(content), "utf8");
		return path;
	}

	it("errors when specFile is not configured", async () => {
		const { tooling } = makeTooling([]);
		await expect(tooling.sync()).rejects.toThrow(/specFile/);
	});

	it("flow: create spec, no existing collection → import; happy path", async () => {
		const specPath = await writeSpec({ openapi: "3.0.0", info: { title: "Rando API" } });
		const { tooling, calls } = makeTooling(
			[
				{ status: 200, body: { specs: [] } },
				{ status: 200, body: { id: "s_new", name: "Rando API", type: "OPENAPI:3.0" } },
				{ status: 200, body: { collections: [] } },
				{ status: 200, body: { collections: [{ id: "c1", uid: "u1", name: "Rando API" }] } },
			],
			{ specFile: specPath, repoRoot }
		);
		await tooling.sync();
		expect(calls).toHaveLength(4);
		expect(calls[0]?.url).toContain("/specs?workspaceId=ws-id");
		expect(calls[1]?.method).toBe("POST");
		expect(calls[2]?.url).toContain("/collections?workspace=ws-id");
		expect(calls[3]?.url).toContain("/import/openapi?workspace=ws-id");
	});

	it("flow: existing spec → upsertSpecFile; existing collection → delete then import", async () => {
		const specPath = await writeSpec({ openapi: "3.0.0", info: { title: "Rando API" } });
		const { tooling, calls } = makeTooling(
			[
				{
					status: 200,
					body: { specs: [{ id: "s_existing", name: "Rando API", type: "OPENAPI:3.0" }] },
				},
				{ status: 200, body: {} },
				{
					status: 200,
					body: { collections: [{ id: "c1", uid: "u_existing", name: "Rando API" }] },
				},
				{ status: 200, body: {} },
				{ status: 200, body: { collections: [{ id: "c2", uid: "u_new", name: "Rando API" }] } },
			],
			{ specFile: specPath, repoRoot }
		);
		await tooling.sync();
		expect(calls[1]?.method).toBe("PATCH");
		expect(calls[3]?.method).toBe("DELETE");
		expect(calls[3]?.url).toContain("/collections/u_existing");
	});

	it("uses info.title from the spec when specName option is omitted", async () => {
		const specPath = await writeSpec({ openapi: "3.0.0", info: { title: "Inferred Name" } });
		const { tooling, calls } = makeTooling(
			[
				{ status: 200, body: { specs: [] } },
				{ status: 200, body: { id: "s_new", name: "Inferred Name", type: "OPENAPI:3.0" } },
				{ status: 200, body: { collections: [] } },
				{
					status: 200,
					body: { collections: [{ id: "c1", uid: "u1", name: "Inferred Name" }] },
				},
			],
			{ specFile: specPath, repoRoot }
		);
		await tooling.sync();
		expect((calls[1]?.body as { name: string }).name).toBe("Inferred Name");
	});

	it("syncs env files when configured (create + update mix)", async () => {
		const specPath = await writeSpec({ openapi: "3.0.0", info: { title: "API" } });
		const stagingPath = "apps/api/env-staging.json";
		const prodPath = "apps/api/env-prod.json";
		await writeFile(join(repoRoot, stagingPath), JSON.stringify({ name: "staging", values: [] }));
		await writeFile(join(repoRoot, prodPath), JSON.stringify({ name: "production", values: [] }));
		const { tooling, calls } = makeTooling(
			[
				{ status: 200, body: { specs: [] } },
				{ status: 200, body: { id: "s_new", name: "API", type: "OPENAPI:3.0" } },
				{ status: 200, body: { collections: [] } },
				{ status: 200, body: { collections: [{ id: "c1", uid: "u1", name: "API" }] } },
				{
					status: 200,
					body: { environments: [{ id: "e1", uid: "eu1", name: "staging" }] },
				},
				{ status: 200, body: { environment: { id: "e1", uid: "eu1", name: "staging" } } },
				{ status: 200, body: { environments: [] } },
				{ status: 200, body: { environment: { id: "e2", uid: "eu2", name: "production" } } },
			],
			{ specFile: specPath, repoRoot, envFiles: [stagingPath, prodPath] }
		);
		await tooling.sync();
		expect(calls[5]?.method).toBe("PUT");
		expect(calls[7]?.method).toBe("POST");
	});
});

// ──────────────────────────────────────────────────────────────────────
// doctor()
// ──────────────────────────────────────────────────────────────────────

describe("PostmanTooling.doctor", () => {
	it("returns ok when /me + workspace are accessible", async () => {
		const { tooling } = makeTooling([
			{ status: 200, body: { user: { id: 1, username: "newton", fullName: "N" } } },
			{
				status: 200,
				body: { workspaces: [{ id: "ws-id", name: "Rando", type: "team" }] },
			},
		]);
		const report = await tooling.doctor();
		expect(report.ok).toBe(true);
		expect(report.message).toContain("newton");
		expect(report.message).toContain("Rando");
	});

	it("returns ok:false when the configured workspace is not in the list", async () => {
		const { tooling } = makeTooling([
			{ status: 200, body: { user: { id: 1, username: "newton", fullName: "N" } } },
			{ status: 200, body: { workspaces: [{ id: "other", name: "Other", type: "team" }] } },
		]);
		const report = await tooling.doctor();
		expect(report.ok).toBe(false);
		expect(report.message).toContain("not visible");
	});

	it("returns ok:false with the error message when /me fails", async () => {
		const { tooling } = makeTooling([{ status: 401, text: "invalid key" }]);
		const report = await tooling.doctor();
		expect(report.ok).toBe(false);
		expect(report.message).toContain("401");
	});
});
