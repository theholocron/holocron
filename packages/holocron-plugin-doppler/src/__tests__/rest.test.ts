import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { createDopplerClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

describe("createDopplerClient", () => {
	it("sends bearer + accept headers and returns the parsed body", async () => {
		const stub = stubFetch([{ status: 200, body: { workplace: { name: "acme" } } }]);
		const client = createDopplerClient({ token: "dp.pt.abc", fetch: stub.fetch });
		const res = await client.me.get();
		expect(res.workplace?.name).toBe("acme");
		expect(stub.calls[0]?.headers["authorization"]).toBe("Bearer dp.pt.abc");
		expect(stub.calls[0]?.headers["accept"]).toBe("application/json");
	});

	it("serializes body as JSON and sets content-type when present", async () => {
		const stub = stubFetch([{ status: 200, body: { project: {} } }]);
		const client = createDopplerClient({ token: "t", fetch: stub.fetch });
		await client.projects.create("demo");
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.headers["content-type"]).toBe("application/json");
		expect(stub.calls[0]?.body).toMatchObject({ name: "demo" });
	});

	it("appends query params to the URL", async () => {
		const stub = stubFetch([{ status: 200, body: { name: "API_KEY", value: {} } }]);
		const client = createDopplerClient({ token: "t", fetch: stub.fetch });
		await client.secrets.get("demo", "dev", "API_KEY");
		expect(stub.calls[0]?.url).toMatch(/project=demo/);
		expect(stub.calls[0]?.url).toMatch(/config=dev/);
		expect(stub.calls[0]?.url).toMatch(/name=API_KEY/);
	});

	it("throws ProviderApiError with the HTTP status on non-2xx", async () => {
		const stub = stubFetch([{ status: 401, body: { messages: ["invalid token"] } }]);
		const client = createDopplerClient({ token: "bad", fetch: stub.fetch });
		const err = await client.me.get().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(401);
		expect((err as ProviderApiError).message).toMatch(/→ 401/);
	});

	it("wraps transport-level failures with status 0", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("fetch failed");
		};
		const client = createDopplerClient({ token: "t", fetch: throwing });
		const err = await client.me.get().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
		expect((err as ProviderApiError).message).toMatch(/TypeError: fetch failed/);
	});
});
