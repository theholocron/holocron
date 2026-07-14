import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { createDopplerRestClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

describe("DopplerRestClient", () => {
	it("sends bearer + accept headers and returns the parsed body", async () => {
		const stub = stubFetch([{ status: 200, body: { workplace: { name: "acme" } } }]);
		const client = createDopplerRestClient({ token: "dp.pt.abc", fetch: stub.fetch });
		const res = await client.request<{ workplace: { name: string } }>("/me");
		expect(res.workplace.name).toBe("acme");
		expect(stub.calls[0]?.headers["authorization"]).toBe("Bearer dp.pt.abc");
		expect(stub.calls[0]?.headers["accept"]).toBe("application/json");
	});

	it("serializes body as JSON and sets content-type when present", async () => {
		const stub = stubFetch([{ status: 200, body: {} }]);
		const client = createDopplerRestClient({ token: "t", fetch: stub.fetch });
		await client.request<unknown>("/projects", { method: "POST", body: { name: "demo" } });
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.headers["content-type"]).toBe("application/json");
		expect(stub.calls[0]?.body).toEqual({ name: "demo" });
	});

	it("appends query params to the URL", async () => {
		const stub = stubFetch([{ status: 200, body: {} }]);
		const client = createDopplerRestClient({ token: "t", fetch: stub.fetch });
		await client.request<unknown>("/configs/config/secret", {
			query: { project: "demo", config: "dev", name: "API_KEY" },
		});
		expect(stub.calls[0]?.url).toMatch(/project=demo/);
		expect(stub.calls[0]?.url).toMatch(/config=dev/);
		expect(stub.calls[0]?.url).toMatch(/name=API_KEY/);
	});

	it("returns undefined on 204", async () => {
		const stub = stubFetch([{ status: 204 }]);
		const client = createDopplerRestClient({ token: "t", fetch: stub.fetch });
		const res = await client.request<unknown>("/whatever");
		expect(res).toBeUndefined();
	});

	it("returns undefined on expectNoContent even with 200", async () => {
		const stub = stubFetch([{ status: 200, body: { ignored: true } }]);
		const client = createDopplerRestClient({ token: "t", fetch: stub.fetch });
		const res = await client.request<unknown>("/whatever", { expectNoContent: true });
		expect(res).toBeUndefined();
	});

	it("throws ProviderApiError with the HTTP status on non-2xx", async () => {
		const stub = stubFetch([{ status: 401, body: { messages: ["invalid token"] } }]);
		const client = createDopplerRestClient({ token: "bad", fetch: stub.fetch });
		const err = await client.request<unknown>("/me").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(401);
		expect((err as ProviderApiError).message).toMatch(/→ 401/);
	});

	it("wraps transport-level failures with status 0", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("fetch failed");
		};
		const client = createDopplerRestClient({ token: "t", fetch: throwing });
		const err = await client.request<unknown>("/me").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
		expect((err as ProviderApiError).message).toMatch(/TypeError: fetch failed/);
	});

	it("trims trailing slashes from the base URL", () => {
		const client = createDopplerRestClient({ token: "t", baseUrl: "https://api.doppler.com/v3///" });
		expect(client.baseUrl).toBe("https://api.doppler.com/v3");
	});
});
