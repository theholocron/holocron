import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

describe("verifyToken", () => {
	it("returns ok with a workspace count + first-workspace label on 200", async () => {
		const stub = stubFetch([
			{
				status: 200,
				body: {
					workspaces: [
						{ _id: "ws-1", name: "Rando", slug: "rando" },
						{ _id: "ws-2", name: "Holocron", slug: "holocron" },
					],
				},
			},
		]);
		const result = await verifyToken("token", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/2 workspaces/);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/Rando/);
		expect(stub.calls[0]?.url).toMatch(/\/v1\/workspace/);
	});

	it("singular grammar for exactly one workspace", async () => {
		const stub = stubFetch([{ status: 200, body: { workspaces: [{ _id: "ws-1", name: "Solo" }] } }]);
		const result = await verifyToken("t", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/1 workspace · first: Solo/);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).not.toMatch(/workspaces/);
	});

	it("returns ok even with zero workspaces (valid token, just no access)", async () => {
		const stub = stubFetch([{ status: 200, body: { workspaces: [] } }]);
		const result = await verifyToken("t", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/0 workspaces/);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/no accessible workspaces/);
	});

	it("returns ok:true with 'scope-limited' subject on 403 (workspace-scoped machine identities)", async () => {
		const stub = stubFetch([{ status: 403, body: { message: "Forbidden" } }]);
		const result = await verifyToken("workspace-scoped", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/scope-limited/);
	});

	it("returns ok:false on 401", async () => {
		const stub = stubFetch([{ status: 401, body: { message: "Unauthorized" } }]);
		const result = await verifyToken("bad", { fetch: stub.fetch });
		expect(result.ok).toBe(false);
		expect((result as { ok: boolean; subject?: string; message?: string }).message).toMatch(/→ 401/);
	});

	it("returns ok:false when the network layer throws", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("network down");
		};
		const result = await verifyToken("t", { fetch: throwing });
		expect(result.ok).toBe(false);
		expect((result as { ok: boolean; subject?: string; message?: string }).message).toMatch(/network down/);
	});
});
