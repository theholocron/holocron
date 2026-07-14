import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { NeonStorage } from "../capabilities/storage.js";
import { createNeonRestClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const PROJECT_ID = "ancient-resonance-12345";
const BASE = `https://console.neon.tech/api/v2/projects/${PROJECT_ID}`;

function makeStorage(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createNeonRestClient({ token: "pat", fetch });
	const storage = new NeonStorage(rest, { projectId: PROJECT_ID });
	return { storage, calls };
}

// ──────────────────────────────────────────────────────────────────────
// listBranches / createBranch / destroyBranch / resetBranch
// ──────────────────────────────────────────────────────────────────────

describe("NeonStorage.listBranches", () => {
	it("GETs /branches and maps the response", async () => {
		const { storage, calls } = makeStorage([
			{
				status: 200,
				body: {
					branches: [
						{ id: "br_main", name: "main", created_at: "2026-06-29T00:00:00Z" },
						{
							id: "br_feat",
							name: "feat/x",
							parent_id: "br_main",
							created_at: "2026-06-29T01:00:00Z",
						},
					],
				},
			},
		]);
		const result = await storage.listBranches!();
		expect(calls[0]?.url).toBe(`${BASE}/branches`);
		expect(result).toEqual([
			{ id: "br_main", name: "main", parentId: null, createdAt: "2026-06-29T00:00:00Z" },
			{ id: "br_feat", name: "feat/x", parentId: "br_main", createdAt: "2026-06-29T01:00:00Z" },
		]);
	});
});

describe("NeonStorage.createBranch", () => {
	it("POSTs with branch + endpoints inline (so connection URI works immediately)", async () => {
		const { storage, calls } = makeStorage([
			{
				status: 201,
				body: {
					branch: { id: "br_new", name: "feat/x", created_at: "2026-06-29T00:00:00Z" },
				},
			},
		]);
		const result = await storage.createBranch!({ name: "feat/x" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe(`${BASE}/branches`);
		expect(calls[0]?.body).toEqual({
			branch: { name: "feat/x" },
			endpoints: [{ type: "read_write" }],
		});
		expect(result.id).toBe("br_new");
	});

	it("passes parent_id through when `from` is supplied", async () => {
		const { storage, calls } = makeStorage([
			{
				status: 201,
				body: { branch: { id: "br_new", name: "feat", created_at: "t" } },
			},
		]);
		await storage.createBranch!({ name: "feat", from: "br_main" });
		const body = calls[0]?.body as { branch: Record<string, unknown> };
		expect(body.branch.parent_id).toBe("br_main");
	});
});

describe("NeonStorage.destroyBranch", () => {
	it("DELETEs the branch", async () => {
		const { storage, calls } = makeStorage([{ status: 204 }]);
		await storage.destroyBranch!("br_feat");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toBe(`${BASE}/branches/br_feat`);
	});

	it("URL-encodes branch names with slashes", async () => {
		const { storage, calls } = makeStorage([{ status: 204 }]);
		await storage.destroyBranch!("feat/x");
		expect(calls[0]?.url).toBe(`${BASE}/branches/feat%2Fx`);
	});
});

describe("NeonStorage.resetBranch", () => {
	it("POSTs to /restore with source_branch_id", async () => {
		const { storage, calls } = makeStorage([{ status: 200, body: {} }]);
		await storage.resetBranch!({ branch: "br_feat", from: "br_main" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe(`${BASE}/branches/br_feat/restore`);
		expect(calls[0]?.body).toEqual({ source_branch_id: "br_main" });
	});
});

// ──────────────────────────────────────────────────────────────────────
// getConnectionString
// ──────────────────────────────────────────────────────────────────────

describe("NeonStorage.getConnectionString", () => {
	it("looks up the default database, then GETs /connection_uri with the right params", async () => {
		const { storage, calls } = makeStorage([
			// 1. databases lookup
			{
				status: 200,
				body: { databases: [{ id: 1, name: "rando", owner_name: "neondb_owner" }] },
			},
			// 2. connection_uri
			{
				status: 200,
				body: { uri: "postgresql://owner:pass@host/rando" },
			},
		]);
		const result = await storage.getConnectionString("br_main");
		expect(calls[0]?.url).toBe(`${BASE}/branches/br_main/databases`);
		expect(calls[1]?.url).toBe(
			`${BASE}/connection_uri?branch_id=br_main&database_name=rando&role_name=neondb_owner&pooled=false`
		);
		expect(result).toBe("postgresql://owner:pass@host/rando");
	});

	it("passes pooled=true through when requested", async () => {
		const { storage, calls } = makeStorage([
			{ status: 200, body: { databases: [{ id: 1, name: "rando", owner_name: "owner" }] } },
			{ status: 200, body: { uri: "postgresql://...-pooler" } },
		]);
		await storage.getConnectionString("br_main", { pooled: true });
		expect(calls[1]?.url).toContain("pooled=true");
	});

	it("throws clearly when the branch has no databases", async () => {
		const { storage } = makeStorage([{ status: 200, body: { databases: [] } }]);
		const err = await storage.getConnectionString("br_uninitialized").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).message).toMatch(/initialize/);
	});
});

// ──────────────────────────────────────────────────────────────────────
// enableExtension
// ──────────────────────────────────────────────────────────────────────

describe("NeonStorage.enableExtension", () => {
	it("runs CREATE EXTENSION IF NOT EXISTS against the default database", async () => {
		const { storage, calls } = makeStorage([
			{ status: 200, body: { databases: [{ id: 1, name: "rando", owner_name: "owner" }] } },
			{ status: 200, body: {} },
		]);
		await storage.enableExtension!({ branch: "br_main", extension: "postgis" });
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toBe(`${BASE}/branches/br_main/databases/rando/run_sql`);
		expect(calls[1]?.body).toEqual({
			query: 'CREATE EXTENSION IF NOT EXISTS "postgis"',
		});
	});

	it("throws ProviderApiError when no database exists on the branch", async () => {
		const { storage } = makeStorage([{ status: 200, body: { databases: [] } }]);
		await expect(storage.enableExtension!({ branch: "br_main", extension: "postgis" })).rejects.toThrow(
			/initialize/
		);
	});
});

// ──────────────────────────────────────────────────────────────────────
// Construction
// ──────────────────────────────────────────────────────────────────────

describe("NeonStorage construction", () => {
	it("throws when projectId is missing", () => {
		const rest = createNeonRestClient({ token: "t" });
		expect(() => new NeonStorage(rest, { projectId: "" })).toThrow(/projectId/);
	});
});
