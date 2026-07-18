import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { createInfisicalClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

describe("createInfisicalClient", () => {
	it("sends bearer + accept headers", async () => {
		const stub = stubFetch([{ status: 200, body: { workspaces: [] } }]);
		const client = createInfisicalClient({ token: "t", fetch: stub.fetch });
		await client.workspaces.list();
		expect(stub.calls[0]?.headers["authorization"]).toBe("Bearer t");
		expect(stub.calls[0]?.headers["accept"]).toBe("application/json");
	});

	it("serializes body as JSON and sets content-type when present", async () => {
		const stub = stubFetch([{ status: 200, body: {} }]);
		const client = createInfisicalClient({ token: "t", fetch: stub.fetch });
		await client.secrets.create("MY_KEY", {
			workspaceId: "ws-1",
			environment: "dev",
			secretValue: "val",
		});
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.headers["content-type"]).toBe("application/json");
		expect(stub.calls[0]?.body).toMatchObject({ secretValue: "val" });
	});

	it("throws ProviderApiError with the HTTP status on non-2xx", async () => {
		const stub = stubFetch([{ status: 401, body: { messages: ["invalid"] } }]);
		const client = createInfisicalClient({ token: "bad", fetch: stub.fetch });
		const err = await client.workspaces.list().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(401);
	});

	it("wraps transport-level failures with status 0", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("fetch failed");
		};
		const client = createInfisicalClient({ token: "t", fetch: throwing });
		const err = await client.workspaces.list().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
	});
});
