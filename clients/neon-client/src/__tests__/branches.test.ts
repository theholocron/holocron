import { describe, expect, it } from "vitest";
import { createNeonClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "neon-test-pat";
const PROJECT_ID = "ancient-resonance-12345";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createNeonClient({ token: TOKEN, fetch }), calls };
}

describe("branches.list", () => {
	it("GET /projects/{projectId}/branches", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					branches: [
						{
							id: "br_main",
							name: "main",
							created_at: "2026-06-29T00:00:00Z",
						},
					],
				},
			},
		]);
		const result = await client.branches.list(PROJECT_ID);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain(`/projects/${PROJECT_ID}/branches`);
		expect(result.branches).toHaveLength(1);
		expect(result.branches[0]?.id).toBe("br_main");
	});
});

describe("branches.create", () => {
	it("POST /projects/{projectId}/branches with branch + endpoints", async () => {
		const { client, calls } = makeClient([
			{
				status: 201,
				body: {
					branch: {
						id: "br_new",
						name: "feat/x",
						created_at: "2026-06-29T00:00:00Z",
					},
				},
			},
		]);
		const result = await client.branches.create(PROJECT_ID, {
			name: "feat/x",
			endpoints: [{ type: "read_write" }],
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(`/projects/${PROJECT_ID}/branches`);
		expect(calls[0]?.body).toMatchObject({
			branch: { name: "feat/x" },
			endpoints: [{ type: "read_write" }],
		});
		expect(result.branch.id).toBe("br_new");
	});

	it("passes parent_id through when provided", async () => {
		const { client, calls } = makeClient([
			{
				status: 201,
				body: {
					branch: { id: "br_new", name: "feat", created_at: "t" },
				},
			},
		]);
		await client.branches.create(PROJECT_ID, {
			name: "feat",
			parent_id: "br_main",
		});
		const body = calls[0]?.body as { branch: Record<string, unknown> };
		expect(body.branch.parent_id).toBe("br_main");
	});

	it("omits endpoints when not provided", async () => {
		const { client, calls } = makeClient([
			{
				status: 201,
				body: {
					branch: { id: "br_new", name: "feat", created_at: "t" },
				},
			},
		]);
		await client.branches.create(PROJECT_ID, { name: "feat" });
		expect(calls[0]?.body).not.toHaveProperty("endpoints");
	});
});

describe("branches.destroy", () => {
	it("DELETE /projects/{projectId}/branches/{branchId}", async () => {
		const { client, calls } = makeClient([{ status: 204 }]);
		await client.branches.destroy(PROJECT_ID, "br_feat");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain(
			`/projects/${PROJECT_ID}/branches/br_feat`,
		);
	});

	it("URL-encodes branch names with slashes", async () => {
		const { client, calls } = makeClient([{ status: 204 }]);
		await client.branches.destroy(PROJECT_ID, "feat/x");
		expect(calls[0]?.url).toContain("/branches/feat%2Fx");
	});
});

describe("branches.restore", () => {
	it("POST /projects/{projectId}/branches/{branchId}/restore with source_branch_id", async () => {
		const { client, calls } = makeClient([{ status: 200, body: {} }]);
		await client.branches.restore(PROJECT_ID, "br_feat", "br_main");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(
			`/projects/${PROJECT_ID}/branches/br_feat/restore`,
		);
		expect(calls[0]?.body).toEqual({ source_branch_id: "br_main" });
	});
});
