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
		if (result.ok) {
			expect(result.subject).toMatch(/2 workspaces/);
			expect(result.subject).toMatch(/Rando/);
		}
		expect(stub.calls[0]?.url).toMatch(/\/v1\/workspace/);
	});

	it("singular grammar for exactly one workspace", async () => {
		const stub = stubFetch([{ status: 200, body: { workspaces: [{ _id: "ws-1", name: "Solo" }] } }]);
		const result = await verifyToken("t", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/1 workspace · first: Solo/);
			expect(result.subject).not.toMatch(/workspaces/);
		}
	});

	it("returns ok even with zero workspaces (valid token, just no access)", async () => {
		const stub = stubFetch([{ status: 200, body: { workspaces: [] } }]);
		const result = await verifyToken("t", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/0 workspaces/);
			expect(result.subject).toMatch(/no accessible workspaces/);
		}
	});

	it("returns ok:false on 401", async () => {
		const stub = stubFetch([{ status: 401, body: { message: "Unauthorized" } }]);
		const result = await verifyToken("bad", { fetch: stub.fetch });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toMatch(/→ 401/);
		}
	});

	it("returns ok:false when the network layer throws", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("network down");
		};
		const result = await verifyToken("t", { fetch: throwing });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toMatch(/network down/);
		}
	});
});
